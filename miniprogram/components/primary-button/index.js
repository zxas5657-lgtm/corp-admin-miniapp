Component({
  options: { addGlobalClass: true },
  properties: {
    text: { type: String, value: '' },
    disabled: { type: Boolean, value: false },
    loading: { type: Boolean, value: false },
    loadingText: { type: String, value: '' },
    reason: { type: String, value: '' },
    fixed: { type: Boolean, value: false }
  },
  methods: {
    onTap() {
      if (this.data.disabled || this.data.loading) return;
      this.triggerEvent('press');
    }
  }
});
