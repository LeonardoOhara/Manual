import hashlib
import os
import re
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path

from flask import (
    Flask,
    abort,
    redirect,
    render_template,
    request,
    send_file,
    url_for,
)


DEFAULT_MANUAL_DIRS = [
    Path.home() / "Downloads" / folder
    for folder in (
        "MANUAIS MOVI",
        "MANUAIS RAIN",
        "MANUAIS INOW",
        "Manuais Scooter",
        "Manuais Bosuer",
        "Outros Manuais",
    )
]
MANUAL_DIRS = [
    Path(path).expanduser()
    for path in os.environ.get(
        "MANUAL_DIRS", os.pathsep.join(map(str, DEFAULT_MANUAL_DIRS))
    ).split(os.pathsep)
    if path.strip()
]
IGNORED_WORDS = {
    "manual", "manuais", "instrucoes", "instrucao", "portugues", "brasil",
    "br", "pt", "ptbr", "do", "da", "de", "para", "e", "o", "a",
    "uma", "por", "favor", "quero", "buscar", "busque", "procurar", "procure",
    "pesquisar", "pesquise", "encontrar", "encontre", "abrir", "abra", "pdf",
    "modelo",
}
NUMBER_WORDS = {
    "zero": 0, "um": 1, "uma": 1, "dois": 2, "duas": 2, "tres": 3, "quatro": 4,
    "cinco": 5, "seis": 6, "sete": 7, "oito": 8, "nove": 9, "dez": 10,
    "onze": 11, "doze": 12, "treze": 13, "quatorze": 14, "catorze": 14,
    "quinze": 15, "dezesseis": 16, "dezessete": 17, "dezoito": 18,
    "dezenove": 19, "vinte": 20, "trinta": 30, "quarenta": 40,
    "cinquenta": 50, "sessenta": 60, "setenta": 70, "oitenta": 80,
    "noventa": 90, "cem": 100, "cento": 100, "duzentos": 200,
    "trezentos": 300, "quatrocentos": 400, "quinhentos": 500,
    "seiscentos": 600, "setecentos": 700, "oitocentos": 800,
    "novecentos": 900,
}
LETTER_NAMES = {
    "ve": "v", "eme": "m", "erre": "r", "esse": "s", "ka": "k",
    "ele": "l", "be": "b", "pe": "p", "te": "t", "ze": "z",
}

app = Flask(__name__)


def normalized_tokens(value):
    value = unicodedata.normalize("NFKD", value.lower())
    value = "".join(character for character in value if not unicodedata.combining(character))
    words = re.findall(r"[a-z]+|[0-9]+", value)
    tokens = []
    index = 0

    while index < len(words):
        word = words[index]
        if word in IGNORED_WORDS:
            index += 1
            continue
        if word in LETTER_NAMES:
            word = LETTER_NAMES[word]

        number = NUMBER_WORDS.get(word)
        if number is None and len(word) >= 4:
            closest_number = max(
                NUMBER_WORDS,
                key=lambda candidate: SequenceMatcher(None, word, candidate).ratio(),
            )
            if SequenceMatcher(None, word, closest_number).ratio() >= 0.82:
                number = NUMBER_WORDS[closest_number]
        if number is not None:
            if number >= 20 and index + 2 < len(words):
                unit = NUMBER_WORDS.get(words[index + 2])
                if words[index + 1] == "e" and unit is not None and 1 <= unit <= 9:
                    number += unit
                    index += 2
            word = str(number)

            if (
                tokens
                and len(tokens[-1]) == 1
                and tokens[-1].isalpha()
                and number <= 9
                and index + 1 < len(words)
            ):
                next_number = NUMBER_WORDS.get(words[index + 1])
                if next_number is not None and next_number <= 9:
                    word += str(next_number)
                    index += 1

        tokens.append(word)
        index += 1

    return tokens


def scan_files():
    manuals = []

    for root in MANUAL_DIRS:
        if not root.is_dir():
            continue
        for path in root.rglob("*.pdf"):
            manuals.append({
                "id": hashlib.sha1(str(path.resolve()).encode()).hexdigest(),
                "title": path.stem,
                "brand": root.name,
                "path": path,
                "tokens": normalized_tokens(path.stem),
            })

    return manuals


def query_score(query_tokens, searchable_tokens, allow_fuzzy=False):
    remaining = list(searchable_tokens)
    scores = []

    for query_token in query_tokens:
        best_score = 0.0
        best_index = None
        for index, target in enumerate(remaining):
            if target == query_token or target.startswith(query_token):
                score = 1.0
            elif allow_fuzzy and len(query_token) >= 4 and not query_token.isdigit():
                score = SequenceMatcher(None, query_token, target).ratio()
                if score < 0.76:
                    continue
                score *= 0.9
            else:
                continue

            if score > best_score:
                best_score = score
                best_index = index

        if best_index is not None:
            remaining.pop(best_index)
        scores.append(best_score)

    return sum(scores) / len(query_tokens) if query_tokens else 0.0


@app.get("/")
def index():
    manuals = scan_files()
    query = request.args.get("q", "").strip()
    brand_filter = request.args.get("brand", "").strip()
    voice_search = request.args.get("voice") == "1"
    queries = [query]
    if voice_search:
        queries.extend(request.args.getlist("heard"))
    query_tokens = [tokens for text in dict.fromkeys(queries) if (tokens := normalized_tokens(text))]
    results = []

    for manual in manuals:
        searchable_tokens = manual["tokens"] + normalized_tokens(manual["brand"])
        score = max(
            (query_score(tokens, searchable_tokens, allow_fuzzy=voice_search)
             for tokens in query_tokens),
            default=0.0,
        )
        if voice_search and query_tokens and score < 0.8:
            continue
        results.append({**manual, "score": score})

    if voice_search:
        results.sort(key=lambda result: (-result["score"], result["title"].lower()))
    else:
        results.sort(key=lambda result: result["title"].lower())
    if voice_search and len(results) == 1 and results[0]["score"] >= 0.95:
        return redirect(url_for("index", pdf=results[0]["id"]))

    brands = sorted({manual["brand"] for manual in manuals})
    selected_manual = next(
        (manual for manual in manuals if manual["id"] == request.args.get("pdf")),
        None,
    )
    return render_template(
        "index.html",
        results=results,
        query=query,
        brands=brands,
        brand_filter=brand_filter,
        manual_count=len(manuals),
        selected_manual=selected_manual,
    )


@app.get("/manual/<manual_id>")
def open_manual(manual_id):
    manuals = scan_files()
    manual = next((item for item in manuals if item["id"] == manual_id), None)
    if manual is None:
        abort(404)
    return send_file(manual["path"], mimetype="application/pdf")


if __name__ == "__main__":
    app.run(debug=os.environ.get("FLASK_DEBUG") == "1")
