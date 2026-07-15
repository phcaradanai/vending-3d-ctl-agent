package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

// installService registers a Windows service via sc.exe.
// The service runs the launcher in "service mode" (--service), which
// in turn spawns node. This avoids requiring golang.org/x/sys.
func installService() {
	dir := exeDir()
	exePath := filepath.Join(dir, "vending-3d-ctl.exe")
	svcName := "VendingCtl"

	if _, err := os.Stat(exePath); err != nil {
		fmt.Fprintf(os.Stderr, "[launcher] Cannot find %s\n", exePath)
		os.Exit(1)
	}

	// Remove existing service if present (ignore errors).
	_ = exec.Command("sc", "stop", svcName).Run()
	_ = exec.Command("sc", "delete", svcName).Run()

	displayName := "Vending 3D Control API"
	description := "Vending 3-door serial / MQTT control API (Node.js)."

	// Create service with auto-start.
	cmd := exec.Command("sc", "create", svcName,
		"binPath=", fmt.Sprintf("\"%s\" --service", exePath),
		"DisplayName=", displayName,
		"start=", "auto",
	)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "[launcher] sc create failed: %v\n", err)
		os.Exit(1)
	}

	// Set description.
	_ = exec.Command("sc", "description", svcName, description).Run()

	// Start it.
	startCmd := exec.Command("sc", "start", svcName)
	startCmd.Stdout = os.Stdout
	startCmd.Stderr = os.Stderr
	if err := startCmd.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "[launcher] sc start failed (service installed but not started): %v\n", err)
	} else {
		fmt.Printf("[launcher] Service '%s' installed and started.\n", svcName)
	}
}

func uninstallService() {
	svcName := "VendingCtl"
	_ = exec.Command("sc", "stop", svcName).Run()

	cmd := exec.Command("sc", "delete", svcName)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "[launcher] sc delete failed: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("[launcher] Service '%s' removed.\n", svcName)
}
