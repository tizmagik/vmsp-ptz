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
  
  // Use PowerShell with MediaPlayer for better audio playback
  const escapedPath = audioPath.replace(/\\/g, '\\\\').replace(/'/g, "''");
  const powershellCommand = `
    Add-Type -AssemblyName presentationCore;
    $player = New-Object System.Windows.Media.MediaPlayer;
    $player.Open('${escapedPath}');
    $player.Play();
    while ($player.NaturalDuration.HasTimeSpan -eq $false) { Start-Sleep -Milliseconds 100 }
    $duration = $player.NaturalDuration.TimeSpan.TotalSeconds;
    Start-Sleep -Seconds $duration;
  `.trim();
  
  audioProcess = spawn('powershell.exe', ['-Command', powershellCommand], {
    stdio: 'pipe',
    cwd: ROOT_DIR,
  });
  
  audioProcess.on('close', (code) => {
    console.log(`Audio playback finished: ${filename}`);
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
