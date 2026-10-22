package main

import (
	"log"
	"net/http"
	"os"

	sabhadb "github.com/Sruhvx-jpg/cobot/packages/sabha-db"
	sabhaserver "github.com/Sruhvx-jpg/cobot/packages/sabha-server/src"
)

func main() {
	dbPath := os.Getenv("SABHA_DB_PATH")
	db, err := sabhadb.Open(dbPath)
	if err != nil {
		log.Fatalf("failed to open sabha database: %v", err)
	}
	defer func() { _ = db.Close() }()
	log.Printf("Sabha database connected at: %s", db.Path)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	server := sabhaserver.New(db)
	log.Printf("Sabha server starting on port %s", port)
	if err := http.ListenAndServe(":"+port, server.Router()); err != nil {
		log.Fatalf("server failed: %v", err)
	}
}
