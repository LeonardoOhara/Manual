const voiceButton = document.querySelector("#voice-button");
const searchForm = document.querySelector("#search-form");
const searchInput = document.querySelector("#search-query");
const voiceSearch = document.querySelector("#voice-search");
const voiceStatus = document.querySelector("#voice-status");
const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;
const pdfDialog = document.querySelector("#pdf-dialog");
const pdfFrame = document.querySelector("#pdf-frame");
const pdfTitle = document.querySelector("#pdf-dialog-title");
const closePdfButton = document.querySelector("#close-pdf");
const brandFilter = document.querySelector("#brand-filter");
const manualCards = [...document.querySelectorAll(".manual-card")];
const emptyState = document.querySelector("#empty-state");
const resultsCount = document.querySelector("#results-count");
const resultsDescription = document.querySelector("#results-description");
const initialVoiceSearch = new URLSearchParams(window.location.search).get("voice") === "1";
const themeToggle = document.querySelector("#theme-toggle");
let updateUrlWhenPdfCloses = true;

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const isDark = theme === "dark";
  const label = isDark ? "Ativar tema claro" : "Ativar tema escuro";
  themeToggle.setAttribute("aria-label", label);
  themeToggle.title = label;
  themeToggle.querySelector(".theme-label").textContent = isDark
    ? "Tema claro"
    : "Tema escuro";
  document.querySelector('meta[name="theme-color"]').content = isDark
    ? "#111827"
    : "#f5f7fb";
}

setTheme(document.documentElement.dataset.theme || "light");
themeToggle.addEventListener("click", () => {
  const nextTheme =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  setTheme(nextTheme);
  try {
    localStorage.setItem("manual-theme", nextTheme);
  } catch {
    voiceStatus.textContent = "Tema alterado; a preferência não pôde ser salva neste navegador.";
  }
});

function normalizeSearchText(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

function searchTokens(value) {
  const tokens = normalizeSearchText(value).match(/[a-z]+|\d+/g) || [];
  const expandedTokens = [...tokens];
  for (let index = 0; index < tokens.length - 1; index += 1) {
    if (tokens[index].length === 1 && /^\d+$/.test(tokens[index + 1])) {
      expandedTokens.push(tokens[index] + tokens[index + 1]);
    }
  }
  return expandedTokens;
}

function updateResults(voiceMode = false) {
  const queryTokens = searchTokens(searchInput.value);
  const selectedBrand = brandFilter.value;
  let visibleCount = 0;

  for (const card of manualCards) {
    const titleTokens = searchTokens(card.dataset.title);
    const brand = card.dataset.brand;
    const matchesText = voiceMode
      ? Number(card.dataset.score) >= 0.8
      : queryTokens.every((queryToken) =>
          titleTokens.some((titleToken) => titleToken.startsWith(queryToken)),
        );
    const visible = matchesText && (!selectedBrand || selectedBrand === brand);
    card.hidden = !visible;
    if (visible) visibleCount += 1;
  }

  emptyState.hidden = visibleCount > 0;
  resultsCount.textContent = `${visibleCount} resultado${visibleCount === 1 ? "" : "s"}`;
  resultsDescription.textContent = queryTokens.length || selectedBrand
    ? `${visibleCount} resultado${visibleCount === 1 ? "" : "s"} para sua busca`
    : `${visibleCount} manual${visibleCount === 1 ? "" : "is"} na biblioteca`;

  const nextUrl = new URL(window.location.href);
  if (searchInput.value.trim()) nextUrl.searchParams.set("q", searchInput.value.trim());
  else nextUrl.searchParams.delete("q");
  if (selectedBrand) nextUrl.searchParams.set("brand", selectedBrand);
  else nextUrl.searchParams.delete("brand");
  nextUrl.searchParams.delete("voice");
  nextUrl.searchParams.delete("heard");
  window.history.replaceState({}, "", nextUrl);
}

searchInput.addEventListener("input", () => updateResults());
brandFilter.addEventListener("change", () => updateResults());
searchForm.addEventListener("submit", (event) => {
  if (voiceSearch.value === "1") return;
  event.preventDefault();
  updateResults();
});
updateResults(initialVoiceSearch);

function removePdfFromUrl() {
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.delete("pdf");
  window.history.replaceState({}, "", nextUrl);
}

function openPdf(url, title, updateHistory = true) {
  if (!pdfDialog.open) {
    pdfDialog.showModal();
  }
  pdfTitle.textContent = title;
  pdfFrame.title = `Manual PDF: ${title}`;
  pdfFrame.src = url;

  if (updateHistory) {
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("pdf", url.split("/").pop());
    window.history.pushState({}, "", nextUrl);
  }
}

function closePdf(updateHistory = true) {
  if (pdfDialog.open) {
    updateUrlWhenPdfCloses = updateHistory;
    pdfDialog.close();
  } else {
    pdfFrame.src = "about:blank";
    if (updateHistory) {
      removePdfFromUrl();
    }
  }
}

pdfDialog.addEventListener("close", () => {
  pdfFrame.src = "about:blank";
  if (updateUrlWhenPdfCloses) {
    removePdfFromUrl();
  }
  updateUrlWhenPdfCloses = true;
});

document.querySelectorAll(".pdf-link").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    openPdf(link.href, link.dataset.title);
  });
});

closePdfButton.addEventListener("click", () => closePdf());

pdfDialog.addEventListener("click", (event) => {
  if (event.target === pdfDialog) {
    closePdf();
  }
});

window.addEventListener("popstate", () => {
  const pdfId = new URL(window.location.href).searchParams.get("pdf");
  if (!pdfId) {
    closePdf(false);
    return;
  }

  const link = [...document.querySelectorAll(".pdf-link")].find((item) =>
    item.href.endsWith(`/${pdfId}`),
  );
  if (link) {
    openPdf(link.href, link.dataset.title, false);
  }
});

if (pdfDialog.dataset.pdfUrl) {
  openPdf(pdfDialog.dataset.pdfUrl, pdfDialog.dataset.pdfTitle, false);
}

if (!SpeechRecognition) {
  voiceButton.disabled = true;
  voiceButton.title = "Pesquisa por voz não disponível neste navegador";
  voiceStatus.textContent =
    "Seu navegador não oferece pesquisa por voz. Você ainda pode digitar o modelo.";
} else {
  const recognition = new SpeechRecognition();
  recognition.lang = "pt-BR";
  recognition.interimResults = true;
  recognition.maxAlternatives = 5;

  voiceButton.addEventListener("click", () => {
    voiceButton.disabled = true;
    voiceStatus.textContent = "Iniciando o microfone...";
    try {
      recognition.start();
    } catch (error) {
      voiceButton.disabled = false;
      voiceStatus.textContent =
        "Não foi possível iniciar a pesquisa por voz. Tente novamente.";
    }
  });

  recognition.addEventListener("start", () => {
    voiceButton.classList.add("listening");
    voiceButton.disabled = true;
    voiceStatus.textContent = "Estou ouvindo. Diga o modelo completo, por exemplo: V30 Elite.";
  });

  recognition.addEventListener("result", (event) => {
    let finalResult;
    let interimTranscript = "";
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      if (result.isFinal) {
        finalResult = result;
      } else {
        interimTranscript += result[0].transcript;
      }
    }

    if (!finalResult) {
      if (interimTranscript.trim()) {
        voiceStatus.textContent = `Entendi até agora: “${interimTranscript.trim()}”`;
      }
      return;
    }

    const alternatives = [];
    for (let index = 0; index < finalResult.length; index += 1) {
      const transcript = finalResult[index].transcript.trim();
      if (transcript && !alternatives.includes(transcript)) {
        alternatives.push(transcript);
      }
    }
    const transcript = alternatives[0] || "";
    if (!transcript) {
      voiceStatus.textContent =
        "Não consegui entender o modelo. Fale mais perto do microfone e tente novamente.";
      return;
    }

    searchInput.value = transcript;
    voiceSearch.value = "1";
    searchForm.elements.brand.value = "";
    searchForm.querySelectorAll('input[name="heard"]').forEach((input) => input.remove());
    for (const alternative of alternatives) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = "heard";
      input.value = alternative;
      searchForm.append(input);
    }
    voiceStatus.textContent = `Entendi: “${transcript}”. Conferindo o modelo...`;
    searchForm.requestSubmit();
  });

  recognition.addEventListener("error", (event) => {
    const messages = {
      "not-allowed": "Permita o acesso ao microfone para pesquisar por voz.",
      "no-speech": "Nenhuma fala detectada. Toque no microfone e tente novamente.",
      network: "A pesquisa por voz falhou por um problema de conexão.",
      "audio-capture": "Não encontrei um microfone. Verifique a conexão e tente novamente.",
    };
    voiceStatus.textContent =
      messages[event.error] || "Não foi possível iniciar a pesquisa por voz. Tente novamente.";
  });

  recognition.addEventListener("end", () => {
    voiceButton.classList.remove("listening");
    voiceButton.disabled = false;
  });
}
