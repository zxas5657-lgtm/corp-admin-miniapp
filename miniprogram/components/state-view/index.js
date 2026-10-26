Component({
  options: { addGlobalClass: true },
  properties: {
    kind: { type: String, value: 'empty' },
    title: { type: String, value: '' },
    body: { type: String, value: '' },
    actionText: { type: String, value: '' },
    secondaryText: { type: String, value: '' },
    surface: { type: String, value: '' }
  },
  methods: {
    onAction() {
      this.triggerEvent('action');
    },
    onSecondary() {
      this.triggerEvent('secondary');
    }
  }
});
