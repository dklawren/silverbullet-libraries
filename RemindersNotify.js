function isTauri() {
  return typeof window !== 'undefined' && window.__TAURI__ != null;
}

// Tauri v2: uses plugin:notification via core.invoke.
// Requires Silverbullet to enable plugin:notification|* in its Tauri ACL capability config.
async function tauriSend(title, body) {
  const core = window.__TAURI__ && window.__TAURI__.core;
  if (!core) return false;
  try {
    await core.invoke('plugin:notification|notify', { options: { title, body } });
    return true;
  } catch (e) {
    console.error('[Reminders] Tauri notify failed:', JSON.stringify(e));
    return false;
  }
}

async function tauriIsPermissionGranted() {
  const core = window.__TAURI__ && window.__TAURI__.core;
  if (!core) return false;
  try {
    return await core.invoke('plugin:notification|is_permission_granted');
  } catch (e) {
    console.error('[Reminders] Tauri isPermissionGranted failed:', JSON.stringify(e));
    return false;
  }
}

async function tauriRequestPermission() {
  const core = window.__TAURI__ && window.__TAURI__.core;
  if (!core) return 'denied';
  try {
    return await core.invoke('plugin:notification|request_permission');
  } catch (e) {
    console.error('[Reminders] Tauri requestPermission failed:', JSON.stringify(e));
    return 'denied';
  }
}

export async function requestPermission() {
  if (isTauri()) {
    let granted = await tauriIsPermissionGranted();
    if (!granted) {
      const perm = await tauriRequestPermission();
      granted = perm === 'granted';
    }
    return granted ? 'granted' : 'denied';
  }

  // Standard Web Notification API (non-Tauri browsers)
  if (typeof Notification === 'undefined') {
    console.warn('[Reminders] Notification API not available');
    return 'unsupported';
  }
  if (Notification.permission !== 'default') {
    return Notification.permission;
  }
  try {
    const result = await new Promise((resolve, reject) => {
      try {
        const ret = Notification.requestPermission(function(perm) {
          resolve(perm);
        });
        if (ret && typeof ret.then === 'function') {
          ret.then(resolve).catch(reject);
        }
      } catch (e) {
        reject(e);
      }
    });
    return result;
  } catch (e) {
    console.error('[Reminders] requestPermission threw:', e && e.name, e && e.message, e);
    return 'error:' + (e && e.message ? e.message : String(e));
  }
}

export async function send(title, body, tag) {
  if (isTauri()) {
    await tauriSend(title, body);
    return;
  }

  // Standard Web Notification API
  if (typeof Notification === 'undefined') {
    console.warn('[Reminders] send: Notification API unavailable');
    return;
  }
  if (Notification.permission !== 'granted') {
    console.warn('[Reminders] send: permission is', Notification.permission, '— skipping');
    return;
  }
  try {
    new Notification(title, { body, tag, icon: '/favicon.png' });
  } catch (e) {
    console.error('[Reminders] Notification constructor threw:', e && e.name, e && e.message, e);
  }
}

export async function permission() {
  if (isTauri()) {
    const granted = await tauriIsPermissionGranted();
    return granted ? 'granted' : 'denied';
  }
  return typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';
}

export function playSound() {
  try {
    var ctx = new (window.AudioContext || window.webkitAudioContext)();
    var gain = ctx.createGain();
    gain.connect(ctx.destination);
    var tones = [{f:880, s:0, e:0.15}, {f:660, s:0.18, e:0.35}];
    for (var i = 0; i < tones.length; i++) {
      var t = tones[i];
      var osc = ctx.createOscillator();
      osc.connect(gain);
      osc.type = 'sine';
      osc.frequency.value = t.f;
      gain.gain.setValueAtTime(0.3, ctx.currentTime + t.s);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t.e);
      osc.start(ctx.currentTime + t.s);
      osc.stop(ctx.currentTime + t.e);
    }
  } catch(e) {
    console.warn('[Reminders] playSound failed:', e);
  }
}
