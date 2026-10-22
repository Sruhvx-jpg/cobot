package sabhaserver_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

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
	require.JSONEq(t, `{"status":"ok"}`, rec.Body.String())
}

func TestAgentRegistration(t *testing.T) {
	db, srv := setupTestServer(t)
	defer db.Close()

	// 1. Success case
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
	require.Equal(t, schema.AgentStatusIdle, agent.Status)

	// 2. Error case: Missing name -> standardized BadReq APIError
	errBody := []byte(`{"role":"reviewer"}`)
	errReq := httptest.NewRequest("POST", "/agents/register", bytes.NewReader(errBody))
	errRec := httptest.NewRecorder()

	srv.Router().ServeHTTP(errRec, errReq)
	require.Equal(t, http.StatusBadRequest, errRec.Code)

	var apiErr internal.APIError
	require.NoError(t, json.Unmarshal(errRec.Body.Bytes(), &apiErr))
	require.Equal(t, http.StatusBadRequest, apiErr.StatusCode)
	require.Equal(t, "name is required", apiErr.Message)
	require.True(t, apiErr.IsOperational)
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
	require.Equal(t, "Code development channel", ch.Topic)

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

func TestSendMessageToChannel(t *testing.T) {
	db, srv := setupTestServer(t)
	defer db.Close()

	// 1. Create channel
	chBody := []byte(`{"name":"general"}`)
	chReq := httptest.NewRequest("POST", "/channels", bytes.NewReader(chBody))
	chRec := httptest.NewRecorder()
	srv.Router().ServeHTTP(chRec, chReq)
	require.Equal(t, http.StatusCreated, chRec.Code)

	var ch schema.Channel
	require.NoError(t, json.Unmarshal(chRec.Body.Bytes(), &ch))

	// 2. Send message with explicit mention and parsed mention
	msgPayload := []byte(`{
		"sender_id": "agent_alpha",
		"content": "Hey @agent_beta check this PR",
		"mentions": ["agent_gamma"]
	}`)
	msgReq := httptest.NewRequest("POST", "/channels/"+ch.ID+"/messages", bytes.NewReader(msgPayload))
	msgRec := httptest.NewRecorder()

	srv.Router().ServeHTTP(msgRec, msgReq)
	require.Equal(t, http.StatusCreated, msgRec.Code)

	var msg schema.Message
	require.NoError(t, json.Unmarshal(msgRec.Body.Bytes(), &msg))
	require.NotEmpty(t, msg.ID)
	require.Equal(t, ch.ID, msg.ReceiverID)
	require.Equal(t, "agent_alpha", msg.SenderID)
	require.Equal(t, "Hey @agent_beta check this PR", msg.Content)

	// 3. Verify mentions were extracted and stored
	var mentions []schema.Mention
	err := db.Select().
		Model(&schema.Mention{}).
		Where("message_id = ?", msg.ID).
		Find(t.Context(), &mentions)
	require.NoError(t, err)
	require.Len(t, mentions, 2)

	// 4. Non-existent channel -> standardized NotFound APIError
	badReq := httptest.NewRequest("POST", "/channels/chan_nonexistent/messages", bytes.NewReader(msgPayload))
	badRec := httptest.NewRecorder()
	srv.Router().ServeHTTP(badRec, badReq)
	require.Equal(t, http.StatusNotFound, badRec.Code)

	var apiErr internal.APIError
	require.NoError(t, json.Unmarshal(badRec.Body.Bytes(), &apiErr))
	require.Equal(t, http.StatusNotFound, apiErr.StatusCode)
	require.Equal(t, "channel not found", apiErr.Message)
	require.True(t, apiErr.IsOperational)
}
