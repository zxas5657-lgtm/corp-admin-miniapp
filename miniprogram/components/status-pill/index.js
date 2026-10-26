function markerFor(tone) {
  if (tone === 'warn' || tone === 'info') return 'soft';
  if (tone === 'updated') return 'dot';
  if (tone === 'important') return 'outline';
  if (tone === 'danger' || tone === 'cancel' || tone === 'error') return 'cancel';
  if (tone === 'plain') return 'plain';
  return 'done';
}

Component({
  options: { addGlobalClass: true },
  properties: {
    text: { type: String, value: '' },
    tone: { type: String, value: 'mute' }
  },
  data: {
    marker: 'done'
  },
  observers: {
    tone(tone) {
      this.setData({ marker: markerFor(tone) });
    }
  },
  lifetimes: {
    attached() {
      this.setData({ marker: markerFor(this.properties.tone) });
    }
  }
});
