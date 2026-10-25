Component({
  options: { addGlobalClass: true },
  properties: {
    show: { type: Boolean, value: false },
    title: { type: String, value: '' },
    cancelText: { type: String, value: '' },
    confirmText: { type: String, value: '' },
    confirmDisabled: { type: Boolean, value: false },
    danger: { type: Boolean, value: false },
    maskLabel: { type: String, value: '' }
  },
  data: {
    rendered: false,
    raised: false
  },
  observers: {
    show(show) {
      this.syncSheet(show);
    }
  },
  lifetimes: {
    attached() {
      this._rendered = false;
      this.syncSheet(this.data.show);
    },
    detached() {
      if (this._timer) clearTimeout(this._timer);
    }
  },
  methods: {
    syncSheet(show) {
      if (this._timer) {
        clearTimeout(this._timer);
        this._timer = null;
      }
      if (show) {
        this._rendered = true;
        this.setData({ rendered: true });
        this._timer = setTimeout(() => {
          if (this.data.show) this.setData({ raised: true });
        }, 20);
        return;
      }
      if (!this._rendered) return;
      this.setData({ raised: false });
      this._timer = setTimeout(() => {
        if (!this.data.show) {
          this._rendered = false;
          this.setData({ rendered: false, raised: false });
        }
      }, 200);
    },
    preventMove() {},
    onPanel() {},
    onClose() {
      this.triggerEvent('close');
    },
    onConfirm() {
      if (this.data.confirmDisabled) return;
      this.triggerEvent('confirm');
    }
  }
});
