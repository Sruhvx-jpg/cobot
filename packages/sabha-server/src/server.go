package sabhaserver

import (
	"net/http"

	sabhadb "github.com/Sruhvx-jpg/cobot/packages/sabha-db"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

// Server encapsulates the Chi router and database connection for Sabha.
type Server struct {
	db     *sabhadb.DB
	router chi.Router
}

// New initializes the central server with Chi router and middleware.
func New(db *sabhadb.DB) *Server {
	s := &Server{
		db:     db,
		router: chi.NewRouter(),
	}

	s.router.Use(middleware.RequestID)
	s.router.Use(middleware.RealIP)
	s.router.Use(middleware.Recoverer)

	s.registerRoutes()
	return s
}

// Router returns the underlying http.Handler.
func (s *Server) Router() http.Handler {
	return s.router
}
