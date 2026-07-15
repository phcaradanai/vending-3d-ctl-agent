package main

import (
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"syscall"
)

// Launcher: spawns bundled node.exe with index.js.
// Resolves runtime relative to the EXE directory so it works from the
// installed location (Program Files) or a portable folder.
//
// Flags:
//   --install-service   register + start Windows service (admin)
//   --uninstall-service remove Windows service (admin)
//   --service           invoked by Windows SCM (run node in foreground)

const appVersion = "1.0.0"

func exeDir() string {
	exe, err := os.Executable()
	if err != nil {
		dir, _ := os.Getwd()
		return dir
	}
	return filepath.Dir(exe)
}

func main() {
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "--version", "-v":
			fmt.Printf("vending-3d-ctl launcher %s (go %s/%s)\n", appVersion, runtime.GOOS, runtime.GOARCH)
			return
		case "--help", "-h":
			printHelp()
			return
		case "--install-service":
			installService()
			return
		case "--uninstall-service":
			uninstallService()
			return
		case "--service":
			// Invoked by Windows SCM via sc.exe — run node in foreground.
			runNode()
			return
		}
	}

	runNode()
}

func printHelp() {
	fmt.Println(`vending-3d-ctl — Vending 3-door Control API launcher

Usage:
  vending-3d-ctl.exe                     Start the API server (foreground console)
  vending-3d-ctl.exe --install-service   Install as Windows service (requires admin)
  vending-3d-ctl.exe --uninstall-service Remove Windows service (requires admin)
  vending-3d-ctl.exe --version           Show version
  vending-3d-ctl.exe --help              Show this help`)
}

func runNode() {
	dir := exeDir()
	nodeExe := filepath.Join(dir, "runtime", "node.exe")
	script := filepath.Join(dir, "app", "index.js")

	// Fallback: if node.exe not found next to launcher, try system PATH.
	if _, err := os.Stat(nodeExe); err != nil {
		nodeExe = "node"
	}

	// If index.js not in ./app, try same dir as launcher (portable single-folder layout).
	if _, err := os.Stat(script); err != nil {
		script = filepath.Join(dir, "index.js")
	}

	cmd := exec.Command(nodeExe, script)
	cmd.Dir = dir
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	// Pass through environment; .env is loaded via dotenv in the app.
	cmd.Env = os.Environ()

	if err := cmd.Start(); err != nil {
		fmt.Fprintf(os.Stderr, "[launcher] Failed to start node: %v\n", err)
		fmt.Fprintf(os.Stderr, "[launcher] Looked for node at: %s\n", nodeExe)
		fmt.Fprintf(os.Stderr, "[launcher] Looked for script at: %s\n", script)
		os.Exit(1)
	}

	fmt.Printf("[launcher] Started vending-3d-ctl (PID %d). Press Ctrl+C to stop.\n", cmd.Process.Pid)

	// Forward Ctrl+C / SIGTERM to child.
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, os.Interrupt, syscall.SIGTERM)

	done := make(chan error, 1)
	go func() {
		done <- cmd.Wait()
	}()

	select {
	case sig := <-sigCh:
		fmt.Printf("\n[launcher] Received %v, shutting down...\n", sig)
		if cmd.Process != nil {
			// Try graceful interrupt first.
			_ = cmd.Process.Signal(os.Interrupt)
		}
		// Then force kill to ensure shutdown.
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
		}
		os.Exit(130)
	case err := <-done:
		if err != nil {
			fmt.Fprintf(os.Stderr, "[launcher] Node exited with error: %v\n", err)
			os.Exit(1)
		}
		fmt.Println("[launcher] Node exited cleanly.")
	}
}
