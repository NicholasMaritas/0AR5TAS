// Testing adapter: preserves the collected Krink source.
class TestScreensaver extends Oa {
  reset() {
    clearTimeout(this.inactiveTimer);
    clearInterval(this.stampInterval);
    this.el.innerHTML = "";
    this.inactiveTimer = setTimeout(() => {
      this.previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      this.el.classList.add("active");
      this.addImage();
      this.stampInterval = setInterval(() => this.addImage(), 20000);
    }, 10000);
  }
  deactivate() {
    if (this.el.classList.contains("active")) {
      document.body.style.overflow = this.previousOverflow || "";
    }
    this.el.classList.remove("active");
    this.reset();
  }
  addImage() {
    const image = new Image();
    image.src = this.images[Math.floor(Math.random() * this.images.length)];
    image.style.top = this.getRandomInt(-10, 110) + "%";
    image.style.left = this.getRandomInt(-10, 110) + "%";
    image.style.transform = "rotate(" + this.getRandomInt(0, 360) + "deg)";
    const generation = this.inactiveTimer;
    image.onload = () => {
      if (this.el.classList.contains("active") && this.inactiveTimer === generation) {
        this.el.appendChild(image);
      }
    };
  }
}
const screensaver = new TestScreensaver();
for (const event of ["pointermove", "pointerdown", "keydown", "wheel", "touchstart", "scroll"]) {
  window.addEventListener(event, () => screensaver.deactivate(), { passive: true });
}
