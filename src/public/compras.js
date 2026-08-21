function apiFetch(url, options) {
  options = options || {};
  options.headers = Object.assign({ "X-Requested-With": "XMLHttpRequest" }, options.headers || {});
  return fetch(url, options).then((res) => {
    if (res.status === 401) {
      showToast("Tu sesión expiró. Recargando...");
      setTimeout(() => (location.href = "/login"), 1500);
      throw new Error("unauthenticated");
    }
    return res;
  });
}

let toastTimer = null;
function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2000);
}

function showConfirm(message, onConfirm) {
  const modal = document.getElementById("modal-confirm");
  const msgEl = document.getElementById("confirm-message");
  const yesBtn = document.getElementById("confirm-yes");
  const noBtn = document.getElementById("confirm-no");
  msgEl.textContent = message;
  modal.classList.remove("hidden");

  function cleanup() {
    modal.classList.add("hidden");
    yesBtn.removeEventListener("click", onYes);
    noBtn.removeEventListener("click", onNo);
  }
  function onYes() {
    cleanup();
    onConfirm();
  }
  function onNo() {
    cleanup();
  }
  yesBtn.addEventListener("click", onYes);
  noBtn.addEventListener("click", onNo);
}

document.addEventListener("DOMContentLoaded", () => {
  const modalAdd = document.getElementById("modal-add-email");
  const modalEdit = document.getElementById("modal-edit-email");
  const btnAdd = document.getElementById("btn-add-email");
  const addEmailField = document.getElementById("add-email-field");
  const formAddEmail = document.getElementById("form-add-email");
  const editEmailField = document.getElementById("edit-email-field");
  const formEditEmail = document.getElementById("form-edit-email");

  // Cierra el modal que contiene al botón, sea cual sea — así los modales
  // nuevos no necesitan que se les agregue aquí a mano (bug ya visto antes).
  document.querySelectorAll(".btn-cancel").forEach((btn) => {
    btn.addEventListener("click", () => {
      const modal = btn.closest(".modal");
      if (modal) modal.classList.add("hidden");
    });
  });

  if (btnAdd) {
    btnAdd.addEventListener("click", () => {
      addEmailField.value = "";
      modalAdd.classList.remove("hidden");
      addEmailField.focus();
    });
  }

  if (formAddEmail) {
    formAddEmail.addEventListener("submit", (e) => {
      e.preventDefault();
      const email = addEmailField.value.trim();
      if (!email) return;
      apiFetch("/compras/emails", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `email=${encodeURIComponent(email)}`,
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.error) {
            showToast(data.error);
            return;
          }
          location.reload();
        })
        .catch((err) => {
          if (err.message !== "unauthenticated") showToast("No se pudo agregar el correo.");
        });
    });
  }

  document.querySelectorAll(".btn-edit-email").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      formEditEmail.dataset.id = btn.dataset.id;
      editEmailField.value = btn.dataset.email;
      modalEdit.classList.remove("hidden");
      editEmailField.focus();
    });
  });

  if (formEditEmail) {
    formEditEmail.addEventListener("submit", (e) => {
      e.preventDefault();
      const id = formEditEmail.dataset.id;
      const email = editEmailField.value.trim();
      if (!email) return;
      apiFetch(`/compras/emails/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `email=${encodeURIComponent(email)}`,
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.error) {
            showToast(data.error);
            return;
          }
          location.reload();
        })
        .catch((err) => {
          if (err.message !== "unauthenticated") showToast("No se pudo guardar el correo.");
        });
    });
  }

  document.querySelectorAll(".btn-delete-email").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      showConfirm(`¿Eliminar ${btn.dataset.email}?`, () => {
        apiFetch(`/compras/emails/${btn.dataset.id}/delete`, { method: "POST" })
          .then((r) => r.json())
          .then(() => {
            const card = btn.closest(".compra-email-card");
            if (card) {
              if (card.classList.contains("active")) showComprasPanelEmpty();
              card.remove();
            }
            showToast("Correo eliminado");
          })
          .catch((err) => {
            if (err.message !== "unauthenticated") showToast("No se pudo eliminar el correo.");
          });
      });
    });
  });

  // ---------- Selección de correo + registro de compras / Mis tarjetas ----------
  const comprasPanel = document.getElementById("compras-panel");
  const modalAddTarjeta = document.getElementById("modal-add-tarjeta");
  const modalEditTarjeta = document.getElementById("modal-edit-tarjeta");
  const addTarjetaField = document.getElementById("add-tarjeta-field");
  const formAddTarjeta = document.getElementById("form-add-tarjeta");
  const editTarjetaField = document.getElementById("edit-tarjeta-field");
  const formEditTarjeta = document.getElementById("form-edit-tarjeta");
  const modalAddCompra = document.getElementById("modal-add-compra");
  const formAddCompra = document.getElementById("form-add-compra");
  const compraCorreoField = document.getElementById("compra-correo-field");
  const compraTarjetaSelect = document.getElementById("compra-tarjeta-select");
  const btnToggleNewTarjeta = document.getElementById("btn-toggle-new-tarjeta");
  const newCompraTarjetaRow = document.getElementById("new-compra-tarjeta-row");
  const newCompraTarjetaValue = document.getElementById("new-compra-tarjeta-value");
  const btnAddCompraTarjeta = document.getElementById("btn-add-compra-tarjeta");
  const compraDescripcionField = document.getElementById("compra-descripcion-field");
  const compraImagenPaste = document.getElementById("compra-imagen-paste");
  const compraImagenPreview = document.getElementById("compra-imagen-preview");
  const compraImagenPlaceholder = document.getElementById("compra-imagen-placeholder");
  const btnRemoveImagen = document.getElementById("btn-remove-imagen");
  const compraMontoHint = document.getElementById("compra-monto-hint");
  const compraTiendaSelect = document.getElementById("compra-tienda-select");
  const btnToggleNewTienda = document.getElementById("btn-toggle-new-tienda");
  const newCompraTiendaRow = document.getElementById("new-compra-tienda-row");
  const newCompraTagName = document.getElementById("new-compra-tag-name");
  const btnAddCompraTag = document.getElementById("btn-add-compra-tag");
  const compraTrackingsList = document.getElementById("compra-trackings-list");
  const btnAddTracking = document.getElementById("btn-add-tracking");
  const compraTrackingsCount = document.getElementById("compra-trackings-count");
  const modalTabBtns = document.querySelectorAll(".modal-tab-btn");
  const modalTabPanels = document.querySelectorAll(".modal-tab-panel");

  modalTabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      modalTabBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      modalTabPanels.forEach((p) => p.classList.toggle("hidden", p.dataset.tabPanel !== btn.dataset.tab));
    });
  });

  function resetModalTabs() {
    modalTabBtns.forEach((b, i) => b.classList.toggle("active", i === 0));
    modalTabPanels.forEach((p, i) => p.classList.toggle("hidden", i !== 0));
  }

  function updateTrackingsCount() {
    const n = compraTrackingsList.querySelectorAll(".compra-tracking-row").length;
    compraTrackingsCount.textContent = n > 0 ? "(" + n + ")" : "";
  }

  let selectedEmailId = null;
  // Tarjetas guardadas del correo seleccionado, para poder elegirlas en el
  // formulario de compra sin tener que pedirlas de nuevo al servidor.
  let currentTarjetas = [];
  // Foto pegada en el modal de compra actual (data URI ya redimensionada), o
  // null si no hay ninguna.
  let compraImagenData = null;

  function escapeHtml(text) {
    return String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  // Redimensiona/comprime una imagen del portapapeles antes de guardarla —
  // así la foto se ve chica en la tarjeta sin engordar la base de datos con
  // capturas de pantalla a resolución completa.
  function resizeImageFile(file, maxDim, quality) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          let width = img.width;
          let height = img.height;
          if (width > height && width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          canvas.getContext("2d").drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", quality));
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function showCompraImagenPreview(dataUrl) {
    if (dataUrl) {
      compraImagenPreview.src = dataUrl;
      compraImagenPreview.classList.remove("hidden");
      compraImagenPlaceholder.classList.add("hidden");
      btnRemoveImagen.classList.remove("hidden");
    } else {
      compraImagenPreview.src = "";
      compraImagenPreview.classList.add("hidden");
      compraImagenPlaceholder.classList.remove("hidden");
      btnRemoveImagen.classList.add("hidden");
    }
  }

  if (compraImagenPaste) {
    compraImagenPaste.addEventListener("paste", (e) => {
      const items = (e.clipboardData || window.clipboardData).items;
      for (const item of items) {
        if (item.type.indexOf("image") !== -1) {
          e.preventDefault();
          const file = item.getAsFile();
          resizeImageFile(file, 320, 0.72)
            .then((dataUrl) => {
              compraImagenData = dataUrl;
              showCompraImagenPreview(dataUrl);
            })
            .catch(() => showToast("No se pudo leer la imagen."));
          break;
        }
      }
    });
  }

  if (btnRemoveImagen) {
    btnRemoveImagen.addEventListener("click", (e) => {
      e.stopPropagation();
      compraImagenData = null;
      showCompraImagenPreview(null);
    });
  }

  // Los montos NUNCA se suman — se listan tal cual se ingresaron, separados
  // por coma. "15,59" se muestra como "$15.00, $59.00".
  function formatMontos(montosStr) {
    if (!montosStr) return "—";
    return montosStr
      .split(",")
      .map((v) => "$" + Number(v).toFixed(2))
      .join(", ");
  }

  // Cache de los últimos registros cargados (id -> objeto completo con sus
  // tiendas), para poder abrir el modal de edición sin tener que codificar
  // listas anidadas en atributos data-*.
  let registroDataById = new Map();

  function trackingChipHtml(t) {
    let text = escapeHtml(t.numero_tracking);
    if (t.articulo) text += " — " + escapeHtml(t.articulo);
    if (t.precio !== null && t.precio !== undefined && t.precio !== "") text += " $" + Number(t.precio).toFixed(2);
    return '<div class="compra-tracking-chip">📦 ' + text + "</div>";
  }

  function registroCardHtml(r) {
    registroDataById.set(r.id, r);
    const tiendaLines = r.tiendas.length
      ? r.tiendas
          .map(
            (t) =>
              '<div class="compra-tienda-line"><b>' +
              (t.tag_name ? escapeHtml(t.tag_name) : "—") +
              ":</b> " +
              formatMontos(t.montos) +
              "</div>"
          )
          .join("")
      : '<div class="compra-tienda-line muted">Sin tienda</div>';
    const trackingLines =
      r.trackings && r.trackings.length
        ? '<div class="compra-trackings-lines">' + r.trackings.map(trackingChipHtml).join("") + "</div>"
        : "";
    const enviadoBadge =
      r.trackings && r.trackings.length
        ? '<div class="compra-enviado-badge">📦 Enviado</div>'
        : "";
    // Miniatura chica de la foto del producto, si tiene — no agranda la
    // tarjeta, va a la derecha de la primera línea.
    const thumbHtml = r.imagen ? '<img class="compra-registro-thumb" src="' + r.imagen + '" alt="" />' : "";
    return (
      '<div class="compra-registro-card" data-id="' + r.id + '">' +
      '<button type="button" class="btn-remove-registro" data-id="' + r.id + '" title="Eliminar">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>' +
      enviadoBadge +
      '<div class="compra-registro-top">' +
      '<span class="compra-registro-top-text"><b>Tarjeta:</b> ' +
      (r.tarjeta ? escapeHtml(r.tarjeta) : "—") +
      ' &nbsp; <b>Correo:</b> ' +
      escapeHtml(r.correo || "—") +
      "</span>" +
      thumbHtml +
      "</div>" +
      (r.descripcion ? '<div class="compra-registro-descripcion">' + escapeHtml(r.descripcion) + "</div>" : "") +
      '<div class="compra-tiendas-lines">' +
      tiendaLines +
      "</div>" +
      trackingLines +
      "</div>"
    );
  }

  function wireRegistroDeleteButtons() {
    comprasPanel.querySelectorAll(".btn-remove-registro").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        showConfirm("¿Eliminar esta compra registrada?", () => {
          apiFetch(`/compras/registros/${btn.dataset.id}/delete`, { method: "POST" })
            .then((r) => r.json())
            .then(() => {
              const card = btn.closest(".compra-registro-card");
              if (card) card.remove();
              showToast("Compra eliminada");
            })
            .catch((err) => {
              if (err.message !== "unauthenticated") showToast("No se pudo eliminar.");
            });
        });
      });
    });
  }

  function wireRegistroCardClicks() {
    comprasPanel.querySelectorAll(".compra-registro-card").forEach((card) => {
      card.addEventListener("click", () => {
        const data = registroDataById.get(Number(card.dataset.id));
        if (data) openCompraModal(data);
      });
    });
  }

  // ---------- "Productos enviados": galería con foto de las compras que ya
  // tienen algún tracking cargado ----------
  function productoEnviadoCardHtml(r) {
    const imgHtml = r.imagen
      ? '<img class="producto-enviado-img" src="' + r.imagen + '" alt="" />'
      : '<div class="producto-enviado-img producto-enviado-img-placeholder">📦</div>';
    const tiendaText = r.tiendas.length
      ? r.tiendas.map((t) => (t.tag_name ? escapeHtml(t.tag_name) : "—") + ": " + formatMontos(t.montos)).join(" · ")
      : "";
    const trackingsHtml = r.trackings
      .map((t) => '<div class="producto-enviado-tracking">📦 ' + escapeHtml(t.numero_tracking) + "</div>")
      .join("");
    return (
      '<div class="producto-enviado-card" data-id="' + r.id + '">' +
      imgHtml +
      '<div class="producto-enviado-info">' +
      '<div class="producto-enviado-desc">' +
      (r.descripcion ? escapeHtml(r.descripcion) : "Sin descripción") +
      "</div>" +
      (tiendaText ? '<div class="producto-enviado-tienda">' + tiendaText + "</div>" : "") +
      trackingsHtml +
      '<div class="producto-enviado-correo muted">' + escapeHtml(r.correo || "") + "</div>" +
      "</div></div>"
    );
  }

  // Tarjeta de información de solo lectura — clic en "Productos enviados"
  // muestra esto, no abre el formulario de edición.
  function productoInfoHtml(r) {
    const imgHtml = r.imagen
      ? '<img class="producto-info-img" src="' + r.imagen + '" alt="" />'
      : '<div class="producto-info-img producto-info-img-placeholder">📦</div>';
    const tiendaText = r.tiendas.length
      ? r.tiendas.map((t) => (t.tag_name ? escapeHtml(t.tag_name) : "—") + ": " + formatMontos(t.montos)).join(" · ")
      : "—";
    const trackingsHtml = r.trackings.length
      ? r.trackings.map((t) => '<div class="producto-info-row">📦 ' + escapeHtml(t.numero_tracking) + "</div>").join("")
      : '<div class="producto-info-row muted">Sin tracking</div>';
    return (
      imgHtml +
      '<h2 class="producto-info-title">' +
      (r.descripcion ? escapeHtml(r.descripcion) : "Sin descripción") +
      "</h2>" +
      '<div class="producto-info-row"><b>Tienda:</b> ' +
      tiendaText +
      "</div>" +
      '<div class="producto-info-row"><b>Tarjeta:</b> ' +
      (r.tarjeta ? escapeHtml(r.tarjeta) : "—") +
      "</div>" +
      '<div class="producto-info-row"><b>Correo:</b> ' +
      escapeHtml(r.correo || "—") +
      "</div>" +
      trackingsHtml
    );
  }

  function openProductoInfoModal(data) {
    document.getElementById("producto-info-content").innerHTML = productoInfoHtml(data);
    document.getElementById("modal-producto-info").classList.remove("hidden");
  }

  function wireProductosEnviadosClicks() {
    comprasPanel.querySelectorAll(".producto-enviado-card").forEach((card) => {
      card.addEventListener("click", () => {
        const data = registroDataById.get(Number(card.dataset.id));
        if (data) openProductoInfoModal(data);
      });
    });
  }

  function showComprasPanelEmpty() {
    selectedEmailId = null;
    currentTarjetas = [];
    comprasPanel.innerHTML = '<div class="list-empty">Selecciona un correo a la izquierda para ver su registro de compras.</div>';
  }

  // Filtro "Solo enviados" — se mantiene marcado al cambiar de correo.
  let onlyEnviados = false;

  function applyEnviadosFilter() {
    comprasPanel.querySelectorAll(".compra-registro-card").forEach((card) => {
      const data = registroDataById.get(Number(card.dataset.id));
      const isEnviado = !!(data && data.trackings && data.trackings.length);
      card.style.display = onlyEnviados && !isEnviado ? "none" : "";
    });
  }

  // ---------- "Mis tarjetas" del correo seleccionado ----------
  function tarjetaCardHtml(t) {
    const usedBadge = t.used ? '<span class="compra-tarjeta-badge">Usada</span>' : "";
    const enviadaCount = t.enviada_count || 0;
    const enviadaBadge =
      enviadaCount > 0
        ? '<span class="compra-tarjeta-badge compra-tarjeta-badge-enviada">Enviada' +
          (enviadaCount > 1 ? " " + enviadaCount : "") +
          "</span>"
        : "";
    return (
      '<div class="compra-tarjeta-card" data-id="' + t.id + '" data-tarjeta="' + escapeHtml(t.tarjeta) + '" data-used="' + (t.used ? "1" : "0") + '">' +
      '<span class="compra-tarjeta-text">' + escapeHtml(t.tarjeta) + usedBadge + enviadaBadge + "</span>" +
      '<div class="icon-actions-group">' +
      '<button type="button" class="icon-action btn-edit-tarjeta" title="Editar" data-id="' + t.id + '" data-tarjeta="' + escapeHtml(t.tarjeta) + '">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg></button>' +
      '<button type="button" class="icon-action danger-hover btn-delete-tarjeta" title="Eliminar" data-id="' + t.id + '" data-tarjeta="' + escapeHtml(t.tarjeta) + '">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M3 6h18"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>' +
      '<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path></svg></button>' +
      "</div></div>"
    );
  }

  // Filtro "Solo sin usar" — se mantiene marcado al cambiar de correo.
  let onlySinUsar = false;

  function applyTarjetasFilter() {
    const list = comprasPanel.querySelector(".tarjetas-list");
    if (!list) return;
    list.querySelectorAll(".compra-tarjeta-card").forEach((card) => {
      const used = card.dataset.used === "1";
      card.style.display = onlySinUsar && used ? "none" : "";
    });
  }

  function wireTarjetaCardButtons() {
    const tarjetasList = comprasPanel.querySelector(".tarjetas-list");
    if (!tarjetasList) return;
    tarjetasList.querySelectorAll(".btn-edit-tarjeta").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        formEditTarjeta.dataset.id = btn.dataset.id;
        editTarjetaField.value = btn.dataset.tarjeta;
        modalEditTarjeta.classList.remove("hidden");
        editTarjetaField.focus();
      });
    });
    tarjetasList.querySelectorAll(".btn-delete-tarjeta").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        showConfirm(`¿Eliminar la tarjeta "${btn.dataset.tarjeta}"?`, () => {
          apiFetch(`/compras/tarjetas/${btn.dataset.id}/delete`, { method: "POST" })
            .then((r) => r.json())
            .then(() => {
              const card = btn.closest(".compra-tarjeta-card");
              if (card) card.remove();
              const list = comprasPanel.querySelector(".tarjetas-list");
              if (list && !list.querySelector(".compra-tarjeta-card")) {
                list.innerHTML = '<div class="list-empty">Todavía no has guardado ninguna tarjeta para este correo.</div>';
              }
              showToast("Tarjeta eliminada");
            })
            .catch((err) => {
              if (err.message !== "unauthenticated") showToast("No se pudo eliminar la tarjeta.");
            });
        });
      });
    });
  }

  function wireComprasPanelTabs() {
    const tabBtns = comprasPanel.querySelectorAll(".compras-panel-tabs .page-tab-btn");
    const tabContents = comprasPanel.querySelectorAll(".compras-panel-tab-content");
    tabBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        tabBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        tabContents.forEach((c) => c.classList.toggle("active", c.dataset.panelTabContent === btn.dataset.panelTab));
      });
    });
  }

  // Renderiza el panel del correo seleccionado con tres pestañas: Registro
  // de compras, Mis tarjetas y Productos enviados (todas propias de ese
  // correo). initialTab deja re-render sin perder en qué pestaña estabas
  // (ej. al guardar una compra desde "Productos enviados").
  function renderPanel(registros, tarjetas, initialTab) {
    initialTab = initialTab || "registro";
    registroDataById = new Map();
    // El backend ya entrega los registros ordenados por creación más
    // reciente primero.
    const registrosListHtml = registros.length
      ? '<div class="compra-registros-list">' + registros.map(registroCardHtml).join("") + "</div>"
      : '<div class="list-empty">Todavía no hay compras registradas para este correo.</div>';
    const tarjetasListHtml = tarjetas.length
      ? '<div class="tarjetas-list">' + tarjetas.map(tarjetaCardHtml).join("") + "</div>"
      : '<div class="tarjetas-list"><div class="list-empty">Todavía no has guardado ninguna tarjeta para este correo.</div></div>';
    const enviados = registros.filter((r) => r.trackings && r.trackings.length);
    const enviadosListHtml = enviados.length
      ? '<div class="productos-enviados-grid">' + enviados.map(productoEnviadoCardHtml).join("") + "</div>"
      : '<div class="list-empty">Todavía no hay productos enviados para este correo.</div>';
    const activeClass = (tab) => (tab === initialTab ? " active" : "");

    comprasPanel.innerHTML =
      '<div class="compras-panel-tabs">' +
      '<button type="button" class="page-tab-btn' + activeClass("registro") + '" data-panel-tab="registro">Registro de compras</button>' +
      '<button type="button" class="page-tab-btn' + activeClass("tarjetas") + '" data-panel-tab="tarjetas">Mis tarjetas</button>' +
      '<button type="button" class="page-tab-btn' + activeClass("enviados") + '" data-panel-tab="enviados">Productos enviados</button>' +
      "</div>" +
      '<div class="compras-panel-tab-content' + activeClass("registro") + '" data-panel-tab-content="registro">' +
      '<div class="compras-panel-header"><h2>Registro de compras</h2>' +
      '<div class="compras-panel-header-actions">' +
      '<label class="compras-filter-enviados"><input type="checkbox" id="filter-enviados"' +
      (onlyEnviados ? " checked" : "") +
      ' /> Solo enviados</label>' +
      '<button type="button" id="btn-add-compra" class="btn-cta btn-icon-only" title="Agregar compra">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
      '<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg></button>' +
      "</div></div>" +
      registrosListHtml +
      "</div>" +
      '<div class="compras-panel-tab-content' + activeClass("tarjetas") + '" data-panel-tab-content="tarjetas">' +
      '<div class="compras-panel-header"><h2>Mis tarjetas</h2>' +
      '<div class="compras-panel-header-actions">' +
      '<label class="compras-filter-enviados"><input type="checkbox" id="filter-sin-usar"' +
      (onlySinUsar ? " checked" : "") +
      ' /> Solo sin usar</label>' +
      '<button type="button" id="btn-add-tarjeta" class="btn-cta btn-icon-only" title="Agregar tarjeta">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
      '<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg></button>' +
      "</div></div>" +
      tarjetasListHtml +
      "</div>" +
      '<div class="compras-panel-tab-content' + activeClass("enviados") + '" data-panel-tab-content="enviados">' +
      '<div class="compras-panel-header"><h2>Productos enviados</h2></div>' +
      enviadosListHtml +
      "</div>";

    wireComprasPanelTabs();
    document.getElementById("btn-add-compra").addEventListener("click", () => openCompraModal(null));
    document.getElementById("filter-enviados").addEventListener("change", (e) => {
      onlyEnviados = e.target.checked;
      applyEnviadosFilter();
    });
    document.getElementById("filter-sin-usar").addEventListener("change", (e) => {
      onlySinUsar = e.target.checked;
      applyTarjetasFilter();
    });
    document.getElementById("btn-add-tarjeta").addEventListener("click", () => {
      addTarjetaField.value = "";
      modalAddTarjeta.classList.remove("hidden");
      addTarjetaField.focus();
    });
    wireRegistroDeleteButtons();
    wireRegistroCardClicks();
    wireTarjetaCardButtons();
    wireProductosEnviadosClicks();
    applyEnviadosFilter();
    applyTarjetasFilter();
  }

  function loadRegistrosFor(id, initialTab) {
    selectedEmailId = id;
    comprasPanel.innerHTML = '<div class="list-empty">Cargando…</div>';
    Promise.all([
      apiFetch(`/compras/emails/${id}/registros`).then((r) => r.json()),
      apiFetch(`/compras/emails/${id}/tarjetas`).then((r) => r.json()),
    ])
      .then(([registrosData, tarjetasData]) => {
        currentTarjetas = tarjetasData.tarjetas || [];
        renderPanel(registrosData.registros || [], currentTarjetas, initialTab);
      })
      .catch((err) => {
        if (err.message !== "unauthenticated") showToast("No se pudo cargar el registro.");
      });
  }

  // Recarga el panel del correo actual sin perder de vista en qué pestaña
  // estaba el usuario (ej. después de guardar una compra desde "Productos
  // enviados", que de otro modo no se actualizaría hasta reseleccionar el
  // correo).
  function reloadCurrentPanel() {
    if (!selectedEmailId) return;
    const activeBtn = comprasPanel.querySelector(".compras-panel-tabs .page-tab-btn.active");
    loadRegistrosFor(selectedEmailId, activeBtn ? activeBtn.dataset.panelTab : "registro");
  }

  document.querySelectorAll(".compra-email-card").forEach((card) => {
    card.addEventListener("click", () => {
      document.querySelectorAll(".compra-email-card").forEach((c) => c.classList.remove("active"));
      card.classList.add("active");
      loadRegistrosFor(card.dataset.id);
    });
  });

  if (formAddTarjeta) {
    formAddTarjeta.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!selectedEmailId) return;
      const tarjeta = addTarjetaField.value.trim();
      if (!tarjeta) return;
      apiFetch("/compras/tarjetas", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `compra_email_id=${encodeURIComponent(selectedEmailId)}&tarjeta=${encodeURIComponent(tarjeta)}`,
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.error) {
            showToast(data.error);
            return;
          }
          modalAddTarjeta.classList.add("hidden");
          const list = comprasPanel.querySelector(".tarjetas-list");
          if (list) {
            const emptyState = list.querySelector(".list-empty");
            if (emptyState) emptyState.remove();
            list.insertAdjacentHTML("afterbegin", tarjetaCardHtml(data));
            wireTarjetaCardButtons();
          }
          showToast("Tarjeta guardada");
        })
        .catch((err) => {
          if (err.message !== "unauthenticated") showToast("No se pudo agregar la tarjeta.");
        });
    });
  }

  if (formEditTarjeta) {
    formEditTarjeta.addEventListener("submit", (e) => {
      e.preventDefault();
      const id = formEditTarjeta.dataset.id;
      const tarjeta = editTarjetaField.value.trim();
      if (!tarjeta) return;
      apiFetch(`/compras/tarjetas/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `tarjeta=${encodeURIComponent(tarjeta)}`,
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.error) {
            showToast(data.error);
            return;
          }
          modalEditTarjeta.classList.add("hidden");
          const card = comprasPanel.querySelector('.compra-tarjeta-card[data-id="' + id + '"]');
          if (card) card.outerHTML = tarjetaCardHtml(data);
          wireTarjetaCardButtons();
          showToast("Tarjeta actualizada");
        })
        .catch((err) => {
          if (err.message !== "unauthenticated") showToast("No se pudo guardar la tarjeta.");
        });
    });
  }

  // ---------- Modal "Agregar/editar compra" ----------
  // La tienda es multi-selección — cada tienda elegida tiene su propio grupo
  // con una o más cantidades. Las cantidades NUNCA se suman: se guardan y se
  // muestran tal cual se escribieron ("Depop: $15, $59"). Al guardar se crea
  // (o edita) UNA compra por tienda, con la lista completa de sus montos.
  const compraMontoGroups = document.getElementById("compra-monto-groups");
  const modalTitle = document.getElementById("modal-add-compra-title");
  const btnSubmitCompra = document.getElementById("btn-submit-compra");
  let editingRegistroId = null;

  function collectGroupMontos(group) {
    const v = group.querySelector(".compra-monto-input").value.trim();
    return v === "" ? [] : [v];
  }

  function updateMontoPlaceholder() {
    const hasGroups = compraMontoGroups.children.length > 0;
    if (compraMontoHint) compraMontoHint.style.display = hasGroups ? "none" : "";
  }

  // Una tienda = un solo monto. Si se compraron dos cosas de la misma
  // tienda, es otra tarjeta de compra aparte (no se acumulan aquí).
  function addMontoGroup(tagId, tagName, initialValue) {
    const div = document.createElement("div");
    div.className = "compra-monto-group";
    div.dataset.tagId = tagId;
    div.dataset.tagName = tagName;
    div.innerHTML =
      '<div class="compra-monto-group-header"><span>' +
      escapeHtml(tagName) +
      '</span></div>' +
      '<div class="row compra-monto-row">' +
      '<span class="muted" style="font-weight:700;">$</span>' +
      '<input type="number" class="compra-monto-input" step="0.01" min="0" placeholder="0.00" />' +
      "</div>";
    compraMontoGroups.appendChild(div);
    if (initialValue !== null && initialValue !== undefined && initialValue !== "") {
      div.querySelector(".compra-monto-input").value = initialValue;
    }
    updateMontoPlaceholder();
    return div;
  }

  // ---------- Trackings dentro de la compra (número, precio, artículo) ----------
  function trackingRowHtml() {
    return (
      '<div class="row compra-tracking-row">' +
      '<input type="text" class="compra-tracking-numero" placeholder="Número de tracking" />' +
      '<button type="button" class="icon-action danger-hover btn-remove-tracking" title="Quitar tracking">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>' +
      "</div>"
    );
  }

  function addTrackingRow(existing) {
    compraTrackingsList.insertAdjacentHTML("beforeend", trackingRowHtml());
    const row = compraTrackingsList.lastElementChild;
    if (existing) {
      row.querySelector(".compra-tracking-numero").value = existing.numero_tracking || "";
    }
    updateTrackingsCount();
    return row;
  }

  compraTrackingsList.addEventListener("click", (e) => {
    const removeBtn = e.target.closest(".btn-remove-tracking");
    if (removeBtn) {
      removeBtn.closest(".compra-tracking-row").remove();
      updateTrackingsCount();
    }
  });

  if (btnAddTracking) {
    btnAddTracking.addEventListener("click", () => addTrackingRow(null));
  }

  function collectTrackings() {
    return Array.from(compraTrackingsList.querySelectorAll(".compra-tracking-row"))
      .map((row) => ({
        numero_tracking: row.querySelector(".compra-tracking-numero").value.trim(),
      }))
      .filter((t) => t.numero_tracking !== "");
  }

  // ---------- Selector de "Mis tarjetas" dentro del modal de compra ----------
  // Reconstruye el <select> con las tarjetas del correo, la más reciente
  // primero. Si selectedText no está entre ellas (tarjeta vieja escrita a
  // mano antes de este cambio), se agrega como opción aparte para no perder
  // el dato.
  function renderCompraTarjetaSelect(selectedText) {
    const ordered = currentTarjetas.slice().sort((a, b) => b.id - a.id);
    let optionsHtml = '<option value="">— Elegir tarjeta —</option>';
    if (selectedText && !ordered.some((t) => t.tarjeta === selectedText)) {
      optionsHtml += '<option value="' + escapeHtml(selectedText) + '">' + escapeHtml(selectedText) + "</option>";
    }
    optionsHtml += ordered
      .map((t) => '<option value="' + escapeHtml(t.tarjeta) + '">' + escapeHtml(t.tarjeta) + "</option>")
      .join("");
    compraTarjetaSelect.innerHTML = optionsHtml;
    compraTarjetaSelect.value = selectedText || "";
    newCompraTarjetaRow.classList.add("hidden");
  }

  function getSelectedTarjetaText() {
    return compraTarjetaSelect.value;
  }

  if (btnToggleNewTarjeta) {
    btnToggleNewTarjeta.addEventListener("click", () => {
      const nowHidden = newCompraTarjetaRow.classList.toggle("hidden");
      if (!nowHidden) {
        newCompraTarjetaValue.value = "";
        newCompraTarjetaValue.focus();
      }
    });
  }

  if (btnAddCompraTarjeta) {
    btnAddCompraTarjeta.addEventListener("click", () => {
      const value = newCompraTarjetaValue.value.trim();
      if (!value) {
        newCompraTarjetaValue.focus();
        return;
      }
      if (!selectedEmailId) return;
      apiFetch("/compras/tarjetas", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `compra_email_id=${encodeURIComponent(selectedEmailId)}&tarjeta=${encodeURIComponent(value)}`,
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.error) {
            showToast(data.error);
            return;
          }
          currentTarjetas.unshift(data);
          renderCompraTarjetaSelect(data.tarjeta);
          newCompraTarjetaValue.value = "";
          // Si la pestaña "Mis tarjetas" ya está en el DOM, se refleja ahí también.
          const list = comprasPanel.querySelector(".tarjetas-list");
          if (list) {
            const emptyState = list.querySelector(".list-empty");
            if (emptyState) emptyState.remove();
            list.insertAdjacentHTML("afterbegin", tarjetaCardHtml(data));
            wireTarjetaCardButtons();
            applyTarjetasFilter();
          }
        })
        .catch((err) => {
          if (err.message !== "unauthenticated") showToast("No se pudo agregar la tarjeta.");
        });
    });
  }

  // Reconstruye el grupo de monto para la tienda elegida en el <select> (o
  // lo limpia si no hay ninguna elegida). Como la tienda es de selección
  // única, siempre hay como mucho un solo grupo.
  function syncMontoGroupWithTiendaSelect(initialValue) {
    compraMontoGroups.innerHTML = "";
    const option = compraTiendaSelect.selectedOptions[0];
    if (option && option.value) {
      addMontoGroup(option.value, option.dataset.name || option.textContent.trim(), initialValue || null);
    }
    updateMontoPlaceholder();
  }

  // existing === null → modo agregar. existing === {id, correo, tarjeta,
  // tiendas: [{tag_id, tag_name, montos}, ...]} → modo editar. Cada tarjeta
  // de compra es de UNA sola tienda (si compras dos cosas de la misma
  // tienda, son dos tarjetas separadas, no una con varias tiendas dentro).
  function openCompraModal(existing) {
    editingRegistroId = existing ? existing.id : null;
    modalTitle.textContent = existing ? "Editar compra" : "Agregar compra";
    btnSubmitCompra.textContent = existing ? "Guardar cambios" : "Guardar compra";
    compraCorreoField.value = existing ? existing.correo : "";
    renderCompraTarjetaSelect(existing ? existing.tarjeta || "" : "");
    newCompraTarjetaValue.value = "";
    compraDescripcionField.value = existing ? existing.descripcion || "" : "";
    compraImagenData = existing ? existing.imagen || null : null;
    showCompraImagenPreview(compraImagenData);
    newCompraTagName.value = "";
    newCompraTiendaRow.classList.add("hidden");
    compraMontoGroups.innerHTML = "";
    compraTrackingsList.innerHTML = "";
    compraTiendaSelect.value = "";
    resetModalTabs();

    if (existing) {
      // Compatibilidad con tarjetas viejas que sí tenían varias tiendas:
      // al editar solo se conserva la primera (ahora es 1 a 1).
      const t = existing.tiendas[0];
      if (t) {
        let option = Array.from(compraTiendaSelect.options).find((o) => o.value === String(t.tag_id));
        if (!option && t.tag_name) {
          // Etiqueta ya borrada — se agrega aparte para no perder el dato.
          option = document.createElement("option");
          option.value = t.tag_id;
          option.textContent = t.tag_name;
          option.dataset.name = t.tag_name;
          compraTiendaSelect.appendChild(option);
        }
        if (option) {
          compraTiendaSelect.value = String(t.tag_id);
          const firstValue = (t.montos || "").split(",")[0].trim();
          syncMontoGroupWithTiendaSelect(firstValue);
        }
      }
      (existing.trackings || []).forEach((t) => addTrackingRow(t));
    }
    updateTrackingsCount();
    updateMontoPlaceholder();
    modalAddCompra.classList.remove("hidden");
  }

  compraTiendaSelect.addEventListener("change", () => syncMontoGroupWithTiendaSelect(null));

  if (btnToggleNewTienda) {
    btnToggleNewTienda.addEventListener("click", () => {
      const nowHidden = newCompraTiendaRow.classList.toggle("hidden");
      if (!nowHidden) {
        newCompraTagName.value = "";
        newCompraTagName.focus();
      }
    });
  }

  if (btnAddCompraTag) {
    btnAddCompraTag.addEventListener("click", () => {
      const name = newCompraTagName.value.trim();
      if (!name) {
        newCompraTagName.focus();
        return;
      }
      apiFetch("/compras/tags", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `name=${encodeURIComponent(name)}`,
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.error) {
            showToast(data.error);
            return;
          }
          const option = document.createElement("option");
          option.value = data.id;
          option.textContent = data.name;
          option.dataset.name = data.name;
          compraTiendaSelect.appendChild(option);
          compraTiendaSelect.value = String(data.id);
          syncMontoGroupWithTiendaSelect(null);
          newCompraTagName.value = "";
          newCompraTiendaRow.classList.add("hidden");
        })
        .catch((err) => {
          if (err.message !== "unauthenticated") showToast("No se pudo crear la etiqueta.");
        });
    });
  }

  if (formAddCompra) {
    formAddCompra.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!selectedEmailId) return;
      const correo = compraCorreoField.value.trim();
      if (!correo) {
        compraCorreoField.focus();
        return;
      }
      const tarjeta = getSelectedTarjetaText();
      const descripcion = compraDescripcionField.value.trim();
      const groups = Array.from(compraMontoGroups.querySelectorAll(".compra-monto-group"));
      if (!groups.length) {
        showToast("Elige la tienda.");
        return;
      }

      // Cada tarjeta es de una sola tienda.
      const tiendas = groups.map((group) => ({
        tag_id: group.dataset.tagId,
        montos: collectGroupMontos(group).join(","),
      }));
      const trackings = collectTrackings();
      const payload = {
        compra_email_id: selectedEmailId,
        correo,
        tarjeta,
        descripcion,
        imagen: compraImagenData,
        tiendas,
        trackings,
      };
      const url = editingRegistroId ? `/compras/registros/${editingRegistroId}` : "/compras/registros";

      apiFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.error) {
            showToast(data.error);
            return;
          }
          modalAddCompra.classList.add("hidden");
          // Recarga completa (en vez de parchear el DOM) para que "Mis
          // tarjetas" (usada/enviada) y "Productos enviados" siempre
          // queden al día sin tener que reseleccionar el correo.
          reloadCurrentPanel();
          showToast(editingRegistroId ? "Compra actualizada" : "Compra agregada");
        })
        .catch((err) => {
          if (err.message !== "unauthenticated") showToast("No se pudo guardar la compra.");
        });
    });
  }
});
