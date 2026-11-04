/**
 * Audio Alarm & Notification Synthesizer using Web Audio API
 * Generates clear, high-fidelity notification sounds without external audio files.
 */
import { ReservationAlarmSoundType } from '../types/index.ts';

let sharedAudioContext: AudioContext | null = null;

export function getAudioContext(): AudioContext | null {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
      sharedAudioContext = new AudioCtx();
    }
    if (sharedAudioContext.state === 'suspended') {
      sharedAudioContext.resume().catch(() => {});
    }
    return sharedAudioContext;
  } catch {
    return null;
  }
}

// Global one-time browser unlock on first interaction
if (typeof window !== 'undefined') {
  const unlockAudio = () => {
    try {
      const ctx = getAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
    } catch {
      // ignore
    }
    window.removeEventListener('click', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
    window.removeEventListener('touchstart', unlockAudio);
  };
  window.addEventListener('click', unlockAudio, { passive: true });
  window.addEventListener('keydown', unlockAudio, { passive: true });
  window.addEventListener('touchstart', unlockAudio, { passive: true });
}

/**
 * Plays the chosen reservation reminder alarm sound
 */
export function playReservationAlarmSound(soundType: ReservationAlarmSoundType = 'chime'): void {
  if (soundType === 'none') return;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    switch (soundType) {
      case 'bell': {
        // Double Desk / Church Bell Chimes (A5 and C6) with warm overtones
        const bells = [
          { freq: 880, time: 0.0, dur: 0.8 },
          { freq: 1046.5, time: 0.35, dur: 1.1 },
        ];
        bells.forEach(({ freq, time, dur }) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now + time);

          gain.gain.setValueAtTime(0, now + time);
          gain.gain.linearRampToValueAtTime(0.3, now + time + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + time + dur);

          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + time);
          osc.stop(now + time + dur + 0.05);
        });
        break;
      }

      case 'beep': {
        // Digital modern double beep
        const beeps = [
          { freq: 950, time: 0.0, dur: 0.12 },
          { freq: 1250, time: 0.16, dur: 0.18 },
        ];
        beeps.forEach(({ freq, time, dur }) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + time);

          gain.gain.setValueAtTime(0, now + time);
          gain.gain.linearRampToValueAtTime(0.28, now + time + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.001, now + time + dur);

          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + time);
          osc.stop(now + time + dur + 0.05);
        });
        break;
      }

      case 'radar': {
        // Sonar / Radar Ping pulse
        const pings = [
          { freq: 620, time: 0.0, dur: 0.45 },
          { freq: 740, time: 0.28, dur: 0.55 },
        ];
        pings.forEach(({ freq, time, dur }) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + time);

          gain.gain.setValueAtTime(0, now + time);
          gain.gain.linearRampToValueAtTime(0.32, now + time + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + time + dur);

          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + time);
          osc.stop(now + time + dur + 0.05);
        });
        break;
      }

      case 'chime':
      default: {
        // Melodic 4-note ascending chime (D5, G5, B5, D6)
        const notes = [
          { freq: 587.33, time: 0.0, dur: 0.28 },
          { freq: 783.99, time: 0.14, dur: 0.28 },
          { freq: 987.77, time: 0.28, dur: 0.32 },
          { freq: 1174.66, time: 0.44, dur: 0.6 },
        ];
        notes.forEach(({ freq, time, dur }) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + time);

          gain.gain.setValueAtTime(0, now + time);
          gain.gain.linearRampToValueAtTime(0.28, now + time + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, now + time + dur);

          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + time);
          osc.stop(now + time + dur + 0.05);
        });
        break;
      }
    }
  } catch (err) {
    console.warn('Audio alarm could not be played:', err);
  }
}

/**
 * Triggers native browser desktop notification if permission is granted
 */
export function sendDesktopNotification(title: string, body: string): void {
  try {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      new Notification(title, {
        body,
        icon: '/favicon.ico',
      });
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then((permission) => {
        if (permission === 'granted') {
          new Notification(title, {
            body,
            icon: '/favicon.ico',
          });
        }
      });
    }
  } catch {
    // Ignore desktop notification errors
  }
}
