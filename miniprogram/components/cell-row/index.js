Component({
  options: { addGlobalClass: true },
  properties: {
    label: { type: String, value: '' },
    value: { type: String, value: '' },
    stacked: { type: Boolean, value: false },
    arrow: { type: Boolean, value: false },
    requiredError: { type: Boolean, value: false },
    errorText: { type: String, value: '' }
  },
  methods: {
    onTap() {
      if (!this.data.arrow) return;
      this.triggerEvent('tap');
    }
  }
});
