package sabhaserver

import (
	"net/http"

	sabhadb "github.com/Sruhvx-jpg/cobot/packages/sabha-db"
)

// Server represents the central HTTP router and dispatcher for Sabha.
type Server struct {
	db  *sabhadb.DB
	mux *http.ServeMux
}

// Config holds configuration parameters for the Sabha server.
type Config struct {
	Addr string
}

// New initializes the central server with the provided database connection.
func New(db *sabhadb.DB) *Server {
	s := &Server{
		db:  db,
		mux: http.NewServeMux(),
	}
	s.registerRoutes()
	return s
}

// Router returns the underlying http.Handler.
func (s *Server) Router() http.Handler {
	return s.mux
}

func (s *Server) registerRoutes() {
	s.mux.HandleFunc("GET /health", s.handleHealth)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"status":"ok"}`))
}
