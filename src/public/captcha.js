export default class Captcha {
  constructor(apiBaseUrl) {
    this.apiBaseUrl = apiBaseUrl;
    this.captchaId = null;
    this.image = null;
    this.question = null;
  }

  async load() {
    const res = await fetch(`${this.apiBaseUrl}/captcha`);
    if (!res.ok) throw new Error('Failed to load captcha');
    const data = await res.json();
    this.captchaId = data.captchaId;
    this.image = data.image;
    this.question = data.question;
  }

  render(container) {
    if (!this.captchaId || !this.image) {
      throw new Error('Captcha not loaded');
    }

    container.innerHTML = `
      <img src="${this.image}" alt="CAPTCHA" style="display:block;margin-bottom:8px;border:1px solid #ccc;" />
      <label for="captcha-input">${this.question}</label>
      <input type="text" id="captcha-input" name="captchaAnswer" required />
      <input type="hidden" name="captchaId" value="${this.captchaId}" />
    `;
  }

  attachToForm(form) {
    form.addEventListener('submit', (e) => {
      const input = form.querySelector('#captcha-input');
      if (!input || !input.value.trim()) {
        e.preventDefault();
        alert('Please complete the captcha');
      }
    });
  }
}
