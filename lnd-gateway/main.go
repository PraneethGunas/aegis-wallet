package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/lightningnetwork/lnd/lnrpc"
)

func main() {
	cfg := ParseConfig()

	log.Printf("Connecting to LND at %s...", cfg.LNDSocket)
	lnd, err := ConnectLND(cfg)
	if err != nil {
		log.Fatalf("Failed to connect to LND: %v", err)
	}
	defer lnd.Close()

	// Verify connection
	info, err := lnd.Lightning.GetInfo(context.Background(), &lnrpc.GetInfoRequest{})
	if err != nil {
		log.Fatalf("LND GetInfo failed: %v", err)
	}
	log.Printf("Connected to LND: %s (block %d, synced=%v, channels=%d)",
		info.Alias, info.BlockHeight, info.SyncedToChain, info.NumActiveChannels)

	// Connect litd (optional — fails gracefully if not available)
	var litd *LitdClient
	litd, err = NewLitdClient(cfg.LitdHost, cfg.LitMacaroonPath)
	if err != nil {
		log.Printf("Warning: litd not available (%v) — account endpoints disabled", err)
	}

	// HTTP server
	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]interface{}{
			"status":    "ok",
			"lnd_alias": info.Alias,
			"timestamp": time.Now().UTC().Format(time.RFC3339),
		})
	})

	registerHandlers(mux, lnd, litd)

	server := &http.Server{
		Addr:    cfg.ListenAddr,
		Handler: logging(mux),
	}

	// Graceful shutdown
	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh
		log.Println("Shutting down...")
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		server.Shutdown(ctx)
	}()

	log.Printf("LND Gateway listening on %s", cfg.ListenAddr)
	if err := server.ListenAndServe(); err != http.ErrServerClosed {
		log.Fatalf("Server error: %v", err)
	}
}
