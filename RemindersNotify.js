export async function requestPermission() {
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission === 'default') {
    return await Notification.requestPermission();
  }
  return Notification.permission;
}

export function send(title, body, tag) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  new Notification(title, { body, tag, icon: '/favicon.png' });
}

export function permission() {
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
