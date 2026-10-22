package sabhaserver_test

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	sabhadb "github.com/Sruhvx-jpg/cobot/packages/sabha-db"
	"github.com/Sruhvx-jpg/cobot/packages/sabha-db/schema"
	sabhaserver "github.com/Sruhvx-jpg/cobot/packages/sabha-server/src"
	"github.com/Sruhvx-jpg/cobot/packages/sabha-server/src/internal"
	"github.com/stretchr/testify/require"
)

func setupTestServer(t *testing.T) (*sabhadb.DB, *sabhaserver.Server) {
	db, err := sabhadb.Open(":memory:")
	require.NoError(t, err)
	srv := sabhaserver.New(db)
	return db, srv
}

func TestHealthCheck(t *testing.T) {
	db, srv := setupTestServer(t)
	defer db.Close()

	req := httptest.NewRequest("GET", "/health", nil)
	rec := httptest.NewRecorder()

	srv.Router().ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	require.JSONEq(t, `{"status":"ok","version":"unstable-alpha-prototype.V0"}`, rec.Body.String())
}

func TestAgentRegistration(t *testing.T) {
	db, srv := setupTestServer(t)
	defer db.Close()

	// Success case
	body := []byte(`{"name":"reviewer-agent", "role":"reviewer"}`)
	req := httptest.NewRequest("POST", "/agents/register", bytes.NewReader(body))
	rec := httptest.NewRecorder()

	srv.Router().ServeHTTP(rec, req)
	require.Equal(t, http.StatusCreated, rec.Code)

	var agent schema.Agent
	err := json.Unmarshal(rec.Body.Bytes(), &agent)
	require.NoError(t, err)
	require.NotEmpty(t, agent.ID)
	require.Equal(t, "reviewer-agent", agent.Name)
	require.Equal(t, "reviewer", agent.Role)

	// Error case: Missing name
	errBody := []byte(`{"role":"reviewer"}`)
	errReq := httptest.NewRequest("POST", "/agents/register", bytes.NewReader(errBody))
	errRec := httptest.NewRecorder()

	srv.Router().ServeHTTP(errRec, errReq)
	require.Equal(t, http.StatusBadRequest, errRec.Code)
}

func TestCreateAndListChannels(t *testing.T) {
	db, srv := setupTestServer(t)
	defer db.Close()

	// 1. Create channel
	body := []byte(`{"name":"dev-channel", "topic":"Code development channel"}`)
	req := httptest.NewRequest("POST", "/channels", bytes.NewReader(body))
	rec := httptest.NewRecorder()

	srv.Router().ServeHTTP(rec, req)
	require.Equal(t, http.StatusCreated, rec.Code)

	var ch schema.Channel
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &ch))
	require.NotEmpty(t, ch.ID)
	require.Equal(t, "dev-channel", ch.Name)

	// 2. List channels
	listReq := httptest.NewRequest("GET", "/channels", nil)
	listRec := httptest.NewRecorder()

	srv.Router().ServeHTTP(listRec, listReq)
	require.Equal(t, http.StatusOK, listRec.Code)

	var channels []schema.Channel
	require.NoError(t, json.Unmarshal(listRec.Body.Bytes(), &channels))
	require.Len(t, channels, 1)
	require.Equal(t, ch.ID, channels[0].ID)
}

func TestClosedLoopActionWebhookAndSSE(t *testing.T) {
	db, srv := setupTestServer(t)
	defer db.Close()

	tsSrv := httptest.NewServer(srv.Router())
	defer tsSrv.Close()

	// 1. Setup mock receiver server for commanded agent (Agent Beta)
	var webhookMu sync.Mutex
	var receivedWebhook internal.WebhookEventPayload
	webhookReceived := make(chan bool, 1)

	mockBetaWebhookServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		webhookMu.Lock()
		_ = json.NewDecoder(r.Body).Decode(&receivedWebhook)
		webhookMu.Unlock()
		webhookReceived <- true
		w.WriteHeader(http.StatusOK)
	}))
	defer mockBetaWebhookServer.Close()

	// 2. Agent Beta subscribes its webhook
	subBody, _ := json.Marshal(internal.SubscribeWebhookRequest{
		AgentID:    "agent_beta",
		WebhookURL: mockBetaWebhookServer.URL,
	})
	resp, err := http.Post(tsSrv.URL+"/webhooks/subscribe", "application/json", bytes.NewReader(subBody))
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	_ = resp.Body.Close()

	// 3. Create channel
	chBody := []byte(`{"name":"general"}`)
	resp, err = http.Post(tsSrv.URL+"/channels", "application/json", bytes.NewReader(chBody))
	require.NoError(t, err)
	var ch schema.Channel
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&ch))
	_ = resp.Body.Close()

	// 4. Commanding agent (Agent Alpha) connects to its targeted SSE stream
	sseCtx, sseCancel := context.WithCancel(context.Background())
	defer sseCancel()

	sseReq, err := http.NewRequestWithContext(sseCtx, "GET", tsSrv.URL+"/agents/agent_alpha/events", nil)
	require.NoError(t, err)

	sseClient := &http.Client{Timeout: 0}
	sseResp, err := sseClient.Do(sseReq)
	require.NoError(t, err)
	defer sseResp.Body.Close()

	sseScanner := bufio.NewScanner(sseResp.Body)
	// Read initial connected frame
	require.True(t, sseScanner.Scan()) // event: connected
	require.True(t, sseScanner.Scan()) // data: {...}
	require.True(t, sseScanner.Scan()) // empty line

	// 5. Agent Alpha commands Agent Beta with action_required ping
	cmdPayload := []byte(`{
		"sender_id": "agent_alpha",
		"content": "Please audit query plan in SQL parser @agent_beta",
		"mention_type": "action"
	}`)
	resp, err = http.Post(tsSrv.URL+"/channels/"+ch.ID+"/messages", "application/json", bytes.NewReader(cmdPayload))
	require.NoError(t, err)
	require.Equal(t, http.StatusCreated, resp.StatusCode)
	var createdMsg schema.Message
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&createdMsg))
	_ = resp.Body.Close()

	// 6. Verify webhook arrived at Agent Beta's listener with action_required and session_id
	select {
	case <-webhookReceived:
		webhookMu.Lock()
		require.Equal(t, "mention", receivedWebhook.Event)
		require.Equal(t, "action", receivedWebhook.Type)
		require.True(t, receivedWebhook.ActionRequired)
		require.NotEmpty(t, receivedWebhook.MentionID)
		require.Equal(t, "agent_alpha", receivedWebhook.SenderID)
		mentionID := receivedWebhook.MentionID
		sessionID := receivedWebhook.SessionID
		webhookMu.Unlock()

		// 7. Agent Beta marks mention as READ
		readResp, err := http.Post(fmt.Sprintf("%s/mentions/%s/read", tsSrv.URL, mentionID), "application/json", nil)
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, readResp.StatusCode)
		_ = readResp.Body.Close()

		// 8. Agent Beta completes task and marks ACTION COMPLETED
		actionPayload, _ := json.Marshal(internal.MarkActionRequest{
			SessionID: sessionID,
			Status:    "completed",
			Result:    "Optimized index scan in 2 turns",
		})
		actionResp, err := http.Post(fmt.Sprintf("%s/mentions/%s/action", tsSrv.URL, mentionID), "application/json", bytes.NewReader(actionPayload))
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, actionResp.StatusCode)
		_ = actionResp.Body.Close()

		// 9. Verify Commanding Agent Alpha receives the action_taken event frame live over SSE!
		var sseEventName string
		var sseData string
		for sseScanner.Scan() {
			line := sseScanner.Text()
			if strings.HasPrefix(line, "event: ") {
				sseEventName = strings.TrimPrefix(line, "event: ")
			} else if strings.HasPrefix(line, "data: ") {
				sseData = strings.TrimPrefix(line, "data: ")
				break
			}
		}

		require.Equal(t, "action_taken", sseEventName)
		var actionResult internal.ActionResultPayload
		require.NoError(t, json.Unmarshal([]byte(sseData), &actionResult))
		require.Equal(t, "action_taken", actionResult.Event)
		require.Equal(t, mentionID, actionResult.MentionID)
		require.Equal(t, sessionID, actionResult.SessionID)
		require.Equal(t, "agent_beta", actionResult.WorkerID)
		require.Equal(t, "completed", actionResult.Status)
		require.Equal(t, "Optimized index scan in 2 turns", actionResult.Result)

	case <-time.After(3 * time.Second):
		t.Fatal("timed out waiting for webhook dispatch")
	}
}
