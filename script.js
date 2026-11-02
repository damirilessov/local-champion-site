/*
 * All editable site copy lives here.
 * To add Kazakh later, copy one language object, translate it, and add a KZ
 * button with data-lang="kz" in index.html and 404.html.
 */
const translations = {
  ru: {
    meta: {
      title: "Local Champion — строительная химия в Казахстане",
      description: "Local Champion развивает производство строительной химии в Казахстане. Первый проект — монтажная пена в Алматинской области.",
      ogDescription: "Развиваем производство строительной химии в Казахстане.",
      locale: "ru_RU"
    },
    a11y: {
      skip: "Перейти к содержанию",
      nav: "Основная навигация",
      language: "Выбор языка"
    },
    nav: { project: "Проект", partners: "Партнёрам", contacts: "Контакты" },
    hero: {
      eyebrow: "Алматы · Казахстан",
      title: "Local Champion",
      subtitle: "Развиваем производство строительной химии в Казахстане.",
      button: "Связаться с нами",
      focusLabel: "Первый фокус",
      focusValue: "Монтажная пена · 2027"
    },
    project: {
      label: "Первый проект",
      heading: "Первый проект — монтажная пена",
      text: "Готовим запуск производства однокомпонентной полиуретановой монтажной пены в Алматинской области: всесезонной, летней и зимней, профессиональной и бытовой. Начало производства — 2027 год.",
      timelineLabel: "Этапы проекта",
      steps: [
        { title: "Подготовка проекта", state: "Завершено" },
        { title: "Выбор оборудования и технологии", state: "Сейчас" },
        { title: "Строительство и запуск", state: "Следующий этап" },
        { title: "Производство", state: "2027" }
      ]
    },
    partners: {
      label: "Партнёрам",
      heading: "Строим производство вместе",
      intro: "Открыты к предметному разговору с будущими клиентами, поставщиками и специалистами.",
      cards: [
        {
          title: "Клиентам",
          text: "Строительным компаниям, оконным производствам и дистрибьюторам — оставьте заявку на пробные партии и условия первых поставок.",
          link: "Обсудить поставки"
        },
        {
          title: "Поставщикам",
          text: "Ищем партнёров по оборудованию, сырью, упаковке и технологиям.",
          link: "Предложить сотрудничество"
        },
        {
          title: "В команду",
          text: "Ищем технологов и инженеров с опытом в химическом производстве.",
          link: "Познакомиться"
        }
      ]
    },
    contacts: {
      label: "Контакты",
      heading: "Давайте поговорим о сотрудничестве",
      intro: "Напишите напрямую или оставьте сообщение — ответим по существу.",
      emailLabel: "Email",
      cityLabel: "Город",
      city: "Алматы, Казахстан"
    },
    form: {
      name: "Имя",
      company: "Компания",
      email: "Email",
      topic: "Тема",
      topicPlaceholder: "Выберите тему",
      topics: { customer: "Клиент", supplier: "Поставщик", career: "Работа", other: "Другое" },
      message: "Сообщение",
      submit: "Отправить",
      sending: "Отправляем…",
      success: "Спасибо! Сообщение отправлено.",
      error: "Не удалось отправить. Напишите нам на info@local-champion.kz.",
      validation: "Проверьте обязательные поля и адрес email.",
      setup: "Форма ещё не подключена. Укажите Formspree ID по инструкции в README."
    },
    footer: {
      copyright: "© 2026 Local Champion. Алматы, Казахстан.",
      top: "Наверх"
    },
    notFound: {
      title: "Страница не найдена",
      text: "Возможно, адрес изменился или в ссылке есть ошибка.",
      button: "На главную"
    }
  },
  en: {
    meta: {
      title: "Local Champion — construction chemicals in Kazakhstan",
      description: "Local Champion is developing construction chemicals manufacturing in Kazakhstan. Our first project is PU foam production in the Almaty region.",
      ogDescription: "Developing construction chemicals manufacturing in Kazakhstan.",
      locale: "en_US"
    },
    a11y: {
      skip: "Skip to content",
      nav: "Main navigation",
      language: "Language selection"
    },
    nav: { project: "Project", partners: "Partners", contacts: "Contacts" },
    hero: {
      eyebrow: "Almaty · Kazakhstan",
      title: "Local Champion",
      subtitle: "Developing construction chemicals manufacturing in Kazakhstan.",
      button: "Contact us",
      focusLabel: "First focus",
      focusValue: "PU foam · 2027"
    },
    project: {
      label: "First project",
      heading: "First project — PU foam",
      text: "We are preparing to launch production of one-component polyurethane foam in the Almaty region: all-season, summer and winter grades, professional and DIY. Production start — 2027.",
      timelineLabel: "Project stages",
      steps: [
        { title: "Project preparation", state: "Complete" },
        { title: "Equipment and technology selection", state: "Current" },
        { title: "Construction and launch", state: "Next stage" },
        { title: "Production", state: "2027" }
      ]
    },
    partners: {
      label: "Partners",
      heading: "Building production together",
      intro: "We are open to focused conversations with future customers, suppliers and specialists.",
      cards: [
        {
          title: "Customers",
          text: "Construction companies, window manufacturers and distributors — request trial batches and terms of first deliveries.",
          link: "Discuss deliveries"
        },
        {
          title: "Suppliers",
          text: "We are looking for partners in equipment, raw materials, packaging and technology.",
          link: "Propose a partnership"
        },
        {
          title: "Join the team",
          text: "We are looking for technologists and engineers with chemical manufacturing experience.",
          link: "Get in touch"
        }
      ]
    },
    contacts: {
      label: "Contacts",
      heading: "Let’s discuss working together",
      intro: "Contact us directly or leave a message — we’ll respond with the relevant details.",
      emailLabel: "Email",
      cityLabel: "City",
      city: "Almaty, Kazakhstan"
    },
    form: {
      name: "Name",
      company: "Company",
      email: "Email",
      topic: "Topic",
      topicPlaceholder: "Select a topic",
      topics: { customer: "Customer", supplier: "Supplier", career: "Career", other: "Other" },
      message: "Message",
      submit: "Send",
      sending: "Sending…",
      success: "Thank you! Your message has been sent.",
      error: "Could not send the message. Please email info@local-champion.kz.",
      validation: "Please check the required fields and email address.",
      setup: "The form is not connected yet. Add the Formspree ID as described in README."
    },
    footer: {
      copyright: "© 2026 Local Champion. Almaty, Kazakhstan.",
      top: "Back to top"
    },
    notFound: {
      title: "Page not found",
      text: "The address may have changed, or there may be an error in the link.",
      button: "Back home"
    }
  }
};

const getValue = (source, path) => path.split(".").reduce((value, key) => value?.[key], source);

let currentLanguage = "ru";

function updateMeta(copy) {
  const isNotFoundPage = document.body.dataset.page === "not-found";
  document.title = isNotFoundPage
    ? `${copy.notFound.title} — Local Champion`
    : copy.meta.title;

  const selectors = {
    'meta[name="description"]': copy.meta.description,
    'meta[property="og:title"]': copy.meta.title,
    'meta[property="og:description"]': copy.meta.ogDescription,
    'meta[property="og:locale"]': copy.meta.locale
  };

  Object.entries(selectors).forEach(([selector, content]) => {
    const element = document.querySelector(selector);
    if (element) element.setAttribute("content", content);
  });
}

function applyLanguage(language) {
  if (!translations[language]) return;

  currentLanguage = language;
  const copy = translations[language];
  document.documentElement.lang = language;

  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const value = getValue(copy, element.dataset.i18n);
    if (typeof value === "string") element.textContent = value;
  });

  document.querySelectorAll("[data-i18n-aria-label]").forEach((element) => {
    const value = getValue(copy, element.dataset.i18nAriaLabel);
    if (typeof value === "string") element.setAttribute("aria-label", value);
  });

  document.querySelectorAll("[data-lang]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.lang === language));
  });

  updateMeta(copy);

  try {
    localStorage.setItem("local-champion-language", language);
  } catch {
    // The site still works if storage is disabled.
  }
}

function initializeLanguage() {
  let savedLanguage = "ru";
  try {
    savedLanguage = localStorage.getItem("local-champion-language") || "ru";
  } catch {
    // RU remains the default if storage is unavailable.
  }
  applyLanguage(translations[savedLanguage] ? savedLanguage : "ru");
}

function initializeForm() {
  const form = document.querySelector(".contact-form");
  if (!form) return;

  const status = form.querySelector(".form-status");
  const submitButton = form.querySelector('button[type="submit"]');
  const submitLabel = submitButton.querySelector("[data-i18n]");
  const topicTrigger = form.querySelector(".custom-select-trigger");
  const topicMenu = form.querySelector(".custom-select-menu");
  const topicInput = form.querySelector('input[name="topic"]');
  const topicValue = form.querySelector("#topic-value");
  const topicOptions = [...form.querySelectorAll('[role="option"]')];

  const closeTopicMenu = (restoreFocus = false) => {
    topicMenu.hidden = true;
    topicTrigger.setAttribute("aria-expanded", "false");
    if (restoreFocus) topicTrigger.focus();
  };

  const openTopicMenu = () => {
    topicMenu.hidden = false;
    topicTrigger.setAttribute("aria-expanded", "true");
    const selectedOption = topicOptions.find((option) => option.getAttribute("aria-selected") === "true");
    (selectedOption || topicOptions[0]).focus();
  };

  const selectTopic = (option) => {
    topicInput.value = option.dataset.value;
    topicValue.dataset.i18n = option.dataset.i18n;
    topicValue.textContent = option.textContent;
    topicOptions.forEach((item) => item.setAttribute("aria-selected", String(item === option)));
    topicTrigger.removeAttribute("aria-invalid");
    closeTopicMenu(true);
  };

  topicTrigger.addEventListener("click", () => {
    if (topicMenu.hidden) openTopicMenu();
    else closeTopicMenu();
  });

  topicTrigger.addEventListener("keydown", (event) => {
    if (["ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      openTopicMenu();
    }
  });

  topicOptions.forEach((option, index) => {
    option.addEventListener("click", () => selectTopic(option));
    option.addEventListener("keydown", (event) => {
      if (["ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        const direction = event.key === "ArrowDown" ? 1 : -1;
        topicOptions[(index + direction + topicOptions.length) % topicOptions.length].focus();
      }
      if (event.key === "Home") {
        event.preventDefault();
        topicOptions[0].focus();
      }
      if (event.key === "End") {
        event.preventDefault();
        topicOptions.at(-1).focus();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeTopicMenu(true);
      }
      if (event.key === "Tab") closeTopicMenu();
    });
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".custom-select")) closeTopicMenu();
  });

  form.querySelectorAll("input, select, textarea").forEach((field) => {
    field.addEventListener("input", () => field.removeAttribute("aria-invalid"));
    field.addEventListener("change", () => field.removeAttribute("aria-invalid"));
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const copy = translations[currentLanguage].form;
    status.className = "form-status";
    status.textContent = "";

    const honeypot = form.querySelector('[name="_gotcha"]');
    if (honeypot.value) return;

    const invalidFields = [...form.querySelectorAll(":invalid")];
    if (!topicInput.value) {
      topicTrigger.setAttribute("aria-invalid", "true");
      invalidFields.push(topicTrigger);
    }
    if (invalidFields.length) {
      invalidFields.forEach((field) => field.setAttribute("aria-invalid", "true"));
      invalidFields[0].focus();
      status.classList.add("is-error");
      status.textContent = copy.validation;
      return;
    }

    if (form.action.includes("YOUR_FORM_ID")) {
      status.classList.add("is-error");
      status.textContent = copy.setup;
      return;
    }

    submitButton.disabled = true;
    submitLabel.textContent = copy.sending;

    try {
      const response = await fetch(form.action, {
        method: "POST",
        body: new FormData(form),
        headers: { Accept: "application/json" }
      });

      if (!response.ok) throw new Error("Form submission failed");

      form.reset();
      topicValue.dataset.i18n = "form.topicPlaceholder";
      topicValue.textContent = translations[currentLanguage].form.topicPlaceholder;
      topicOptions.forEach((option) => option.setAttribute("aria-selected", "false"));
      status.classList.add("is-success");
      status.textContent = copy.success;
    } catch {
      status.classList.add("is-error");
      status.textContent = copy.error;
    } finally {
      submitButton.disabled = false;
      submitLabel.textContent = copy.submit;
    }
  });
}

document.querySelectorAll("[data-lang]").forEach((button) => {
  button.addEventListener("click", () => applyLanguage(button.dataset.lang));
});

const header = document.querySelector(".site-header");
if (header) {
  const updateHeader = () => header.classList.toggle("is-scrolled", window.scrollY > 12);
  updateHeader();
  window.addEventListener("scroll", updateHeader, { passive: true });
}

initializeLanguage();
initializeForm();
