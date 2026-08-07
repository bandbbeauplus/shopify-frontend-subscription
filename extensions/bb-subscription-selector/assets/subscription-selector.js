document.querySelectorAll("[data-bb-subscription-form]").forEach((form) => {
  if (form.dataset.ready === "true") return;
  form.dataset.ready = "true";

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector("button[type='submit']");
    const error = form.querySelector("[data-bb-subscription-error]");
    button.disabled = true;
    error.hidden = true;

    try {
      const response = await fetch(window.Shopify.routes.root + "cart/add.js", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          items: [{ id: Number(new FormData(form).get("id")), quantity: 1 }],
        }),
      });
      if (!response.ok) throw new Error("This plan could not be added. Please try again.");
      window.location.assign(window.Shopify.routes.root + "checkout");
    } catch (cause) {
      error.textContent = cause instanceof Error ? cause.message : "Something went wrong. Please try again.";
      error.hidden = false;
      button.disabled = false;
    }
  });
});
