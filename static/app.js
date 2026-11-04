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
const manualList = document.querySelector("#manual-list");
const emptyState = document.querySelector("#empty-state");
const resultsCount = document.querySelector("#results-count");
const resultsDescription = document.querySelector("#results-description");
const clearSearch = document.querySelector("#clear-search");
const themeToggle = document.querySelector("#theme-toggle");
const numberWords = new Map(
  Object.entries({
    zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4,
    cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
    onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14,
    quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18,
    dezenove: 19, vinte: 20, trinta: 30, quarenta: 40,
    cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80,
    noventa: 90, cem: 100, cento: 100, duzentos: 200,
    trezentos: 300, quatrocentos: 400, quinhentos: 500,
    seiscentos: 600, setecentos: 700, oitocentos: 800, novecentos: 900,
  }),
);
const letterNames = new Map([
  ["ve", "v"], ["eme", "m"], ["erre", "r"], ["esse", "s"], ["ka", "k"],
  ["ele", "l"], ["be", "b"], ["pe", "p"], ["te", "t"], ["ze", "z"],
]);
const modelLetterConfusions = new Map([
  ["b", new Set(["v", "p"])],
  ["v", new Set(["b", "f"])],
  ["p", new Set(["b"])],
  ["f", new Set(["v"])],
  ["d", new Set(["t"])],
  ["t", new Set(["d"])],
  ["c", new Set(["k"])],
  ["k", new Set(["c"])],
  ["g", new Set(["j"])],
  ["j", new Set(["g"])],
]);
const modelCodePattern = /^[a-z]{1,3}\d{1,4}$/;
const ignoredWords = new Set([
  "manual", "manuais", "instrucoes", "instrucao", "portugues", "brasil",
  "br", "pt", "ptbr", "do", "da", "de", "para", "e", "o", "a", "uma",
  "por", "favor", "quero", "buscar", "busque", "procurar", "procure",
  "pesquisar", "pesquise", "encontrar", "encontre", "abrir", "abra", "pdf",
  "modelo",
]);

let manuals = [];
let manualCards = new Map();
let voiceScores = null;
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
  } catch (error) {
    console.error("Could not save theme preference.", error);
    voiceStatus.textContent =
      "Tema alterado; a preferência não pôde ser salva neste navegador.";
  }
});

function normalizeText(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

function closestNumber(word) {
  if (numberWords.has(word)) return numberWords.get(word);
  if (word.length < 4) return null;

  let closest = null;
  let closestSimilarity = 0;
  for (const [candidate, number] of numberWords) {
    const similarity = tokenSimilarity(word, candidate);
    if (similarity > closestSimilarity) {
      closest = number;
      closestSimilarity = similarity;
    }
  }
  return closestSimilarity >= 0.82 ? closest : null;
}

function normalizedTokens(value) {
  const words = normalizeText(value).match(/[a-z]+|\d+/g) || [];
  const tokens = [];

  for (let index = 0; index < words.length; index += 1) {
    let word = letterNames.get(words[index]) || words[index];
    let number = /^\d+$/.test(word) ? Number(word) : closestNumber(word);

    if (number !== null && number >= 20 && words[index + 1] === "e") {
      const unit = closestNumber(words[index + 2] || "");
      if (unit !== null && unit >= 1 && unit <= 9) {
        number += unit;
        index += 2;
      }
    }

    if (number !== null) {
      const previous = tokens[tokens.length - 1];
      if (previous && previous.length === 1 && /^[a-z]$/.test(previous) && number <= 9999) {
        tokens[tokens.length - 1] += String(number);
      } else {
        tokens.push(String(number));
      }
      continue;
    }

    if (!ignoredWords.has(word)) tokens.push(word);
  }

  return tokens;
}

function tokenSimilarity(left, right) {
  if (left === right) return 1;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return 1 - previous[right.length] / Math.max(left.length, right.length);
}

function correctVoiceTokens(tokens) {
  const knownModelCodes = new Set(
    manuals.flatMap((manual) =>
      normalizedTokens(manual.title).filter((token) => modelCodePattern.test(token)),
    ),
  );
  const corrections = [];
  const correctedTokens = tokens.map((token) => {
    if (!modelCodePattern.test(token) || knownModelCodes.has(token)) return token;
    const candidates = [...(modelLetterConfusions.get(token[0]) || [])]
      .map((letter) => `${letter}${token.slice(1)}`)
      .filter((candidate) => knownModelCodes.has(candidate));
    const uniqueCandidates = [...new Set(candidates)];
    if (uniqueCandidates.length !== 1) return token;
    corrections.push({ heard: token, matched: uniqueCandidates[0] });
    return uniqueCandidates[0];
  });
  return { tokens: correctedTokens, corrections };
}

function scoreTokens(queryTokens, targetTokens, allowFuzzy = false) {
  const remaining = [...targetTokens];
  const scores = queryTokens.map((queryToken) => {
    let bestScore = 0;
    let bestIndex = -1;
    for (let index = 0; index < remaining.length; index += 1) {
      const target = remaining[index];
      let score = 0;
      if (target === queryToken || target.startsWith(queryToken)) {
        score = 1;
      } else if (allowFuzzy && queryToken.length >= 4 && !/^\d+$/.test(queryToken)) {
        const similarity = tokenSimilarity(queryToken, target);
        if (similarity >= 0.76) score = similarity * 0.9;
      }
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }
    if (bestIndex >= 0) remaining.splice(bestIndex, 1);
    return bestScore;
  });
  return scores.length
    ? scores.reduce((total, score) => total + score, 0) / scores.length
    : 0;
}

function scoreVoiceTokens(queryTokens, targetTokens) {
  return Math.max(
    0,
    ...queryTokens.map((queryToken) => {
      const score = scoreTokens([queryToken], targetTokens, true);
      if (score > 0) return score;
      if (/^\d+$/.test(queryToken) && queryToken.length >= 1) {
        return targetTokens.some(
          (target) => modelCodePattern.test(target) && target.endsWith(queryToken),
        )
          ? 1
          : 0;
      }
      return 0;
    }),
  );
}

function createManualCard(manual) {
  const card = document.createElement("article");
  card.className = "manual-card";
  card.dataset.id = manual.id;
  card.dataset.title = manual.title;
  card.dataset.brand = manual.brand;

  const info = document.createElement("div");
  info.className = "manual-info";

  const icon = document.createElement("span");
  icon.className = "file-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.innerHTML =
    '<svg viewBox="0 0 24 24"><path d="M7 3h7l5 5v13H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M14 3v6h5M8 14h8m-8 3h6"/></svg>';

  const titleWrap = document.createElement("div");
  titleWrap.className = "manual-title-wrap";
  const title = document.createElement("h3");
  title.textContent = manual.title;
  const meta = document.createElement("div");
  meta.className = "manual-meta";
  const brand = document.createElement("span");
  brand.textContent = manual.brand;
  const separator = document.createElement("span");
  separator.className = "meta-separator";
  separator.textContent = "·";
  const type = document.createElement("span");
  type.textContent = "PDF";
  meta.append(brand, separator, type);
  titleWrap.append(title, meta);
  info.append(icon, titleWrap);

  const link = document.createElement("a");
  link.className = "pdf-link";
  link.href = `https://drive.google.com/file/d/${encodeURIComponent(manual.id)}/view?usp=sharing`;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.dataset.id = manual.id;
  link.dataset.title = manual.title;
  link.setAttribute("aria-label", `Abrir PDF: ${manual.title}`);
  link.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3h7v7m-1-6-9 9"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg><span>Abrir PDF</span>';
  card.append(info, link);
  return card;
}

function populateBrands() {
  const brands = [...new Set(manuals.map((manual) => manual.brand))]
    .sort((left, right) => left.localeCompare(right, "pt-BR"));
  for (const brand of brands) {
    const option = document.createElement("option");
    option.value = brand;
    option.textContent = brand;
    brandFilter.append(option);
  }
}

function updateResults() {
  const queryTokens = normalizedTokens(searchInput.value);
  const selectedBrand = brandFilter.value;
  const visibleManuals = manuals
    .map((manual) => ({
      manual,
      score: voiceScores?.get(manual.id) ?? 0,
    }))
    .filter(({ manual, score }) => {
      const titleTokens = normalizedTokens(manual.title);
      const matchesText = voiceScores
        ? score >= 0.8
        : queryTokens.every((queryToken) =>
            titleTokens.some((titleToken) => titleToken.startsWith(queryToken)),
          );
      return matchesText && (!selectedBrand || selectedBrand === manual.brand);
    })
    .sort((left, right) => {
      if (voiceScores && right.score !== left.score) return right.score - left.score;
      return left.manual.title.localeCompare(right.manual.title, "pt-BR");
    });

  const visibleIds = new Set(visibleManuals.map(({ manual }) => manual.id));
  for (const { manual } of visibleManuals) {
    const card = manualCards.get(manual.id);
    card.hidden = false;
    manualList.append(card);
  }
  for (const [id, card] of manualCards) {
    if (!visibleIds.has(id)) {
      card.hidden = true;
      manualList.append(card);
    }
  }

  const visibleCount = visibleManuals.length;
  emptyState.hidden = visibleCount > 0;
  resultsCount.textContent = `${visibleCount} resultado${visibleCount === 1 ? "" : "s"}`;
  resultsDescription.textContent = queryTokens.length || selectedBrand
    ? `${visibleCount} resultado${visibleCount === 1 ? "" : "s"} para sua busca`
    : `${visibleCount} manual${visibleCount === 1 ? "" : "is"} na biblioteca`;
  clearSearch.hidden = !searchInput.value.trim() && !selectedBrand;

  const nextUrl = new URL(window.location.href);
  if (searchInput.value.trim()) nextUrl.searchParams.set("q", searchInput.value.trim());
  else nextUrl.searchParams.delete("q");
  if (selectedBrand) nextUrl.searchParams.set("brand", selectedBrand);
  else nextUrl.searchParams.delete("brand");
  nextUrl.searchParams.delete("voice");
  nextUrl.searchParams.delete("heard");
  window.history.replaceState({}, "", nextUrl);
}

function openPdf(manual, updateHistory = true) {
  if (!pdfDialog.open) pdfDialog.showModal();
  pdfTitle.textContent = manual.title;
  pdfFrame.title = `Manual PDF: ${manual.title}`;
  pdfFrame.src = `https://drive.google.com/file/d/${encodeURIComponent(manual.id)}/preview`;
  if (updateHistory) {
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("pdf", manual.id);
    window.history.pushState({}, "", nextUrl);
  }
}

function removePdfFromUrl() {
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.delete("pdf");
  window.history.replaceState({}, "", nextUrl);
}

function closePdf(updateHistory = true) {
  if (pdfDialog.open) {
    updateUrlWhenPdfCloses = updateHistory;
    pdfDialog.close();
  } else {
    pdfFrame.src = "about:blank";
    if (updateHistory) removePdfFromUrl();
  }
}

function searchByVoice(alternatives) {
  const correctedAlternatives = alternatives.map(correctVoiceTokens);
  const corrections = correctedAlternatives.flatMap(({ corrections: items }) => items);
  alternatives = correctedAlternatives
    .map(({ tokens }) => tokens)
    .filter((tokens, index, all) =>
      tokens.length && all.findIndex((item) => item.join(" ") === tokens.join(" ")) === index,
    );
  const scored = manuals.map((manual) => {
    const titleTokens = normalizedTokens(manual.title);
    const brandTokens = normalizedTokens(manual.brand);
    const score = Math.max(
      ...alternatives.map((alternative) =>
        scoreVoiceTokens(alternative, [...titleTokens, ...brandTokens]),
      ),
    );
    return [manual.id, score];
  });
  voiceScores = new Map(scored);
  searchInput.value = alternatives[0]?.join(" ") || "";
  brandFilter.value = "";
  updateResults();

  const matches = manuals
    .map((manual) => ({ manual, score: voiceScores.get(manual.id) }))
    .filter(({ score }) => score >= 0.8)
    .sort((left, right) => right.score - left.score);
  const correctionMessage = corrections.length
    ? `Ajustei “${corrections[0].heard.toUpperCase()}” para “${corrections[0].matched.toUpperCase()}” com base nos modelos do catálogo. `
    : "";
  if (matches.length === 1 && matches[0].score >= 0.95) {
    voiceStatus.textContent =
      `${correctionMessage}Encontrei: “${matches[0].manual.title}”. Abrindo o manual.`;
    openPdf(matches[0].manual);
  } else if (matches.length) {
    voiceStatus.textContent =
      `${correctionMessage}Entendi: “${searchInput.value}”. Selecione o manual correto nos resultados.`;
  } else {
    voiceStatus.textContent =
      `${correctionMessage}Não encontrei um manual para “${searchInput.value}”. Tente falar o modelo novamente.`;
  }
}

async function loadManuals() {
  try {
    const response = await fetch(new URL("./data/manuals.json", document.baseURI));
    if (!response.ok) {
      throw new Error(`Catalog request failed with status ${response.status}`);
    }
    const catalog = await response.json();
    if (!Array.isArray(catalog) || catalog.some((item) =>
      !item || typeof item.id !== "string" ||
      typeof item.title !== "string" || typeof item.brand !== "string"
    )) {
      throw new Error("The manual catalog has an invalid format.");
    }

    manuals = catalog;
    manualCards = new Map(manuals.map((manual) => [manual.id, createManualCard(manual)]));
    populateBrands();

    const params = new URLSearchParams(window.location.search);
    searchInput.value = params.get("q") || "";
    brandFilter.value = params.get("brand") || "";
    if (params.get("voice") === "1") {
      const alternatives = params.getAll("heard")
        .map((text) => normalizedTokens(text))
        .filter((tokens) => tokens.length);
      if (alternatives.length) {
        searchByVoice(alternatives);
      } else {
        updateResults();
      }
    } else {
      updateResults();
    }

    const selectedManual = manuals.find((manual) => manual.id === params.get("pdf"));
    if (selectedManual) openPdf(selectedManual, false);
  } catch (error) {
    console.error("Could not load the manual catalog.", error);
    resultsCount.textContent = "Erro";
    resultsDescription.textContent = "Não foi possível carregar a biblioteca.";
    emptyState.querySelector("h3").textContent = "Biblioteca indisponível";
    emptyState.querySelector("p").textContent =
      "Verifique sua conexão e tente recarregar a página.";
    emptyState.hidden = false;
  }
}

searchInput.addEventListener("input", () => {
  voiceScores = null;
  voiceStatus.textContent = "";
  updateResults();
});
brandFilter.addEventListener("change", updateResults);
clearSearch.addEventListener("click", (event) => {
  event.preventDefault();
  searchInput.value = "";
  brandFilter.value = "";
  voiceScores = null;
  voiceStatus.textContent = "";
  updateResults();
  searchInput.focus();
});
searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  updateResults();
});

manualList.addEventListener("click", (event) => {
  const link = event.target.closest(".pdf-link");
  if (!link) return;
  const manual = manuals.find((item) => item.id === link.dataset.id);
  if (!manual) return;
  event.preventDefault();
  openPdf(manual);
});

closePdfButton.addEventListener("click", () => closePdf());
pdfDialog.addEventListener("close", () => {
  pdfFrame.src = "about:blank";
  if (updateUrlWhenPdfCloses) removePdfFromUrl();
  updateUrlWhenPdfCloses = true;
});
pdfDialog.addEventListener("click", (event) => {
  if (event.target === pdfDialog) closePdf();
});
window.addEventListener("popstate", () => {
  const pdfId = new URL(window.location.href).searchParams.get("pdf");
  const manual = manuals.find((item) => item.id === pdfId);
  if (manual) openPdf(manual, false);
  else closePdf(false);
});

if (!SpeechRecognition) {
  voiceButton.disabled = true;
  voiceButton.title = "Pesquisa por voz não disponível neste navegador";
  voiceStatus.textContent =
    "Seu navegador não oferece pesquisa por voz. Você ainda pode digitar o modelo.";
} else {
  const recognition = new SpeechRecognition();
  recognition.lang = "pt-BR";
  recognition.interimResults = true;
  recognition.maxAlternatives = 10;

  voiceButton.addEventListener("click", () => {
    voiceButton.disabled = true;
    voiceStatus.textContent = "Iniciando o microfone...";
    try {
      recognition.start();
    } catch (error) {
      console.error("Could not start speech recognition.", error);
      voiceButton.disabled = false;
      voiceStatus.textContent =
        "Não foi possível iniciar a pesquisa por voz. Tente novamente.";
    }
  });

  recognition.addEventListener("start", () => {
    voiceButton.classList.add("listening");
    voiceButton.disabled = true;
    voiceStatus.textContent =
      "Estou ouvindo. Diga a letra e o número separadamente, por exemplo: V, vinte.";
  });

  recognition.addEventListener("result", (event) => {
    let finalResult;
    let interimTranscript = "";
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      if (result.isFinal) finalResult = result;
      else interimTranscript += result[0].transcript;
    }
    if (!finalResult) {
      if (interimTranscript.trim()) {
        voiceStatus.textContent = `Entendi até agora: “${interimTranscript.trim()}”`;
      }
      return;
    }

    const alternatives = [];
    for (let index = 0; index < finalResult.length; index += 1) {
      const tokens = normalizedTokens(finalResult[index].transcript);
      if (tokens.length && !alternatives.some((item) => item.join(" ") === tokens.join(" "))) {
        alternatives.push(tokens);
      }
    }
    if (!alternatives.length) {
      voiceStatus.textContent =
        "Não consegui entender o modelo. Fale mais perto do microfone e tente novamente.";
      return;
    }
    voiceSearch.value = "1";
    searchByVoice(alternatives);
    voiceSearch.value = "0";
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

loadManuals();
