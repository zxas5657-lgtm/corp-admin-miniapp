Component({
  options: { addGlobalClass: true },
  properties: {
    kind: { type: String, value: 'info' },
    text: { type: String, value: '' },
    closable: { type: Boolean, value: false },
    closeLabel: { type: String, value: '' }
  },
  methods: {
    onClose() {
      this.triggerEvent('close');
    }
  }
});
