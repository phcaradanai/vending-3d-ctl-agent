package main

import (
	"embed"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"strings"
	"syscall"
)

//go:embed embedded/*
var staticFiles embed.FS

const version = "1.0.0"

func main() {
	port := flag.Int("port", 0, "HTTP port (0 = random)")
	flag.Parse()

	subFS, err := fs.Sub(staticFiles, "embedded")
	if err != nil {
		log.Fatalf("Failed to open embedded FS: %v", err)
	}

	listener, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", *port))
	if err != nil {
		log.Fatalf("Failed to listen: %v", err)
	}

	addr := listener.Addr().(*net.TCPAddr)
	url := fmt.Sprintf("http://127.0.0.1:%d/manual-test/index.html", addr.Port)

	fmt.Printf("┌──────────────────────────────────────────────────┐\n")
	fmt.Printf("│  vending-3d-ctl-agent / Manual Test Console      │\n")
	fmt.Printf("│  version %-41s │\n", version)
	fmt.Printf("│                                                  │\n")
	fmt.Printf("│  %-46s │\n", url)
	fmt.Printf("│                                                  │\n")
	fmt.Printf("│  Press Ctrl+C to stop.                          │\n")
	fmt.Printf("└──────────────────────────────────────────────────┘\n")

	// Open browser
	go openBrowser(url)

	// Handler: serve embedded files under /manual-test/
	fileServer := http.FileServer(http.FS(subFS))
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Strip /manual-test/ prefix to serve embedded files
		r.URL.Path = strings.TrimPrefix(r.URL.Path, "/manual-test")
		fileServer.ServeHTTP(w, r)
	})

	// Graceful shutdown
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-sigCh
		fmt.Println("\nShutting down...")
		listener.Close()
		os.Exit(0)
	}()

	err = http.Serve(listener, handler)
	if err != nil {
		log.Printf("Server stopped: %v", err)
	}
}

func openBrowser(url string) {
	var cmd string
	var args []string

	switch runtime.GOOS {
	case "windows":
		cmd = "cmd"
		args = []string{"/c", "start", url}
	case "darwin":
		cmd = "open"
		args = []string{url}
	default: // linux
		cmd = "xdg-open"
		args = []string{url}
	}

	if err := exec.Command(cmd, args...).Start(); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to open browser: %v\n", err)
		fmt.Fprintf(os.Stderr, "Open manually: %s\n", url)
	}
}
