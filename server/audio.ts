import { spawn, ChildProcess } from 'child_process';
import { Router } from 'express';
import type { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { AUDIO_DIR, ROOT_DIR } from './config.js';

// Global audio state
let audioProcess: ChildProcess | null = null;
let isAudioPlaying = false;
let currentAudioFile = '';

/**
 * Play an audio file on the host machine using PowerShell MediaPlayer
 */
export function playAudio(filename: string): { success: boolean; message: string } {
  if (!filename) {
    return { success: false, message: 'Filename required' };
  }
  
  const audioPath = path.join(AUDIO_DIR, filename);
  
  if (!fs.existsSync(audioPath)) {
    return { success: false, message: 'Audio file not found' };
  }
  
  // Stop any existing audio
  if (audioProcess) {
    audioProcess.kill();
    audioProcess = null;
  }
  
  console.log(`Playing audio: ${filename}`);
  isAudioPlaying = true;
  currentAudioFile = filename;
  
  const nircmdPath = path.join(ROOT_DIR, 'nircmd.exe');
  const escapedPath = audioPath.replace(/\\/g, '\\\\').replace(/'/g, "''");
  const escapedNircmdPath = nircmdPath.replace(/\\/g, '\\\\').replace(/'/g, "''");
  
  const bellDeviceSearch = process.env.BELL_AUDIO_DEVICE_SEARCH || 'usb-c';
  const defaultDeviceName = process.env.DEFAULT_AUDIO_DEVICE || 'Speakers';
  
  const powershellScript = `
    $nircmd = '${escapedNircmdPath}'
    
    # Find USB-C audio device
    Add-Type @'
using System;
using System.Runtime.InteropServices;

public class AudioDevices {
    [DllImport("winmm.dll", CharSet = CharSet.Auto)]
    public static extern int waveOutGetDevCaps(IntPtr deviceID, out WAVEOUTCAPS pwoc, int cbwoc);
    
    [DllImport("winmm.dll")]
    public static extern int waveOutGetNumDevs();
    
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    public struct WAVEOUTCAPS {
        public ushort wMid;
        public ushort wPid;
        public uint vDriverVersion;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
        public string szPname;
        public uint dwFormats;
        public ushort wChannels;
        public ushort wReserved1;
        public uint dwSupport;
    }
}
'@
    
    $searchName = "usb-c"
    $numDevices = [AudioDevices]::waveOutGetNumDevs()
    $matchedDeviceName = ""
    
    for ($i = 0; $i -lt $numDevices; $i++) {
        $caps = New-Object AudioDevices+WAVEOUTCAPS
        $size = [System.Runtime.InteropServices.Marshal]::SizeOf($caps)
        [AudioDevices]::waveOutGetDevCaps([IntPtr]$i, [ref]$caps, $size) | Out-Null
        if ($caps.szPname.ToLower() -like "*$searchName*") {
            $matchedDeviceName = $caps.szPname
            Write-Host "Found USB-C device: $matchedDeviceName"
            break
        }
    }
    
    try {
        if ($matchedDeviceName) {
            # Extract device name without the (device ID) portion
            $cleanDeviceName = $matchedDeviceName -replace '\\s*\\(.*$', ''
            
            # Set for both multimedia (1) and communications (2) roles
            & "$nircmd" setdefaultsounddevice "$cleanDeviceName" 1 | Out-Null
            & "$nircmd" setdefaultsounddevice "$cleanDeviceName" 2 | Out-Null
            Start-Sleep -Milliseconds 500
        } else {
            Write-Host "WARNING: No USB-C device found!"
        }
        
        # Play audio
        Add-Type -AssemblyName presentationCore
        $player = New-Object System.Windows.Media.MediaPlayer
        $player.Open('${escapedPath}')
        $player.Play()
        
        while ($player.NaturalDuration.HasTimeSpan -eq $false) { 
            Start-Sleep -Milliseconds 50 
        }
        
        $duration = $player.NaturalDuration.TimeSpan.TotalSeconds
        $elapsed = 0
        
        while ($elapsed -lt $duration) {
            Start-Sleep -Milliseconds 100
            $elapsed += 0.1
        }
        
        $player.Stop()
        $player.Close()
    } finally {
        # Restore default audio device
        if ($matchedDeviceName) {
            Start-Sleep -Milliseconds 200
            & "$nircmd" setdefaultsounddevice "${defaultDeviceName}" 1 | Out-Null
            & "$nircmd" setdefaultsounddevice "${defaultDeviceName}" 2 | Out-Null
            Write-Host "Restored default audio device"
        }
    }
  `.trim();
  
  audioProcess = spawn('powershell.exe', ['-Command', powershellScript], {
    stdio: 'pipe',
    cwd: ROOT_DIR,
  });
  
  let hasError = false;
  
  // Capture stderr to detect errors
  audioProcess.stderr?.on('data', (data) => {
    const errorMsg = data.toString();
    console.error(`Audio playback error: ${errorMsg}`);
    hasError = true;
  });
  
  // Capture stdout for debugging
  audioProcess.stdout?.on('data', (data) => {
    const output = data.toString().trim();
    if (output) {
      console.log(`Audio output: ${output}`);
    }
  });
  
  audioProcess.on('close', (code) => {
    if (code !== 0 || hasError) {
      console.error(`Audio playback failed with code ${code}`);
    } else {
      console.log(`Audio playback finished: ${filename}`);
    }
    audioProcess = null;
    isAudioPlaying = false;
    currentAudioFile = '';
  });
  
  audioProcess.on('error', (err) => {
    console.error(`Audio process error: ${err.message}`);
    audioProcess = null;
    isAudioPlaying = false;
    currentAudioFile = '';
  });
  
  return { success: true, message: `Playing ${filename}` };
}

/**
 * Stop currently playing audio
 */
export function stopAudio(): { success: boolean; message: string } {
  if (audioProcess) {
    console.log('Stopping audio playback');
    audioProcess.kill();
    audioProcess = null;
    isAudioPlaying = false;
    currentAudioFile = '';
    
    // Note: Device restoration happens in PowerShell finally block
    
    return { success: true, message: 'Audio stopped' };
  } else {
    return { success: false, message: 'No audio playing' };
  }
}

/**
 * Get the currently playing audio file (without extension)
 */
export function getAudioStatus(): string {
  return currentAudioFile.replace('.mp3', '');
}

/**
 * Check if audio is currently playing
 */
export function isPlayingAudio(): boolean {
  return isAudioPlaying;
}

/**
 * Stop audio on shutdown
 */
export function cleanupAudio(): void {
  if (audioProcess) {
    audioProcess.kill();
    audioProcess = null;
  }
}

/**
 * Create router with audio routes
 */
export function createAudioRouter(): Router {
  const router = Router();

  router.post('/play-audio', (req: Request, res: Response) => {
    const { filename } = req.body;
    const result = playAudio(filename);
    
    if (!result.success) {
      const statusCode = result.message === 'Audio file not found' ? 404 : 400;
      return res.status(statusCode).json(result);
    }
    
    res.json(result);
  });

  router.post('/stop-audio', (req: Request, res: Response) => {
    const result = stopAudio();
    res.json(result);
  });

  router.get('/audio-status', (req: Request, res: Response) => {
    res.send(getAudioStatus());
  });

  return router;
}
