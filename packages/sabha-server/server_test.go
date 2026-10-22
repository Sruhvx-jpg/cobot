package sabhaserver_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	sabhadb "github.com/Sruhvx-jpg/cobot/packages/sabha-db"
	sabhaserver "github.com/Sruhvx-jpg/cobot/packages/sabha-server"
	"github.com/stretchr/testify/require"
)

func TestHealthCheck(t *testing.T) {
	db, err := sabhadb.Open(":memory:")
	require.NoError(t, err)
	defer db.Close()

	srv := sabhaserver.New(db)

	req := httptest.NewRequest("GET", "/health", nil)
	rec := httptest.NewRecorder()

	srv.Router().ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	require.JSONEq(t, `{"status":"ok"}`, rec.Body.String())
}
