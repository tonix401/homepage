"""Regenerates src/utils/model2vec.fixture.json.

The fixture pins our TypeScript tokenizer to HuggingFace's, using the same
vocabulary the browser ships (public/semantic/model.json). Query and document
vectors have to come from the same tokenizer to be comparable, so a silent
drift here would quietly degrade search rather than fail loudly.

    uv run --with tokenizers python scripts/generate_tokenizer_fixture.py

Run it from the repo root, after npm run prepare:semantic.
"""

import json
from tokenizers import Tokenizer, models, normalizers, pre_tokenizers

meta = json.load(open("public/semantic/model.json"))
vocab = {t: i for i, t in enumerate(meta["tokens"])}

tok = Tokenizer(models.WordPiece(vocab, unk_token="[UNK]", max_input_chars_per_word=meta["maxInputCharsPerWord"]))
tok.normalizer = normalizers.BertNormalizer(clean_text=True, handle_chinese_chars=True, strip_accents=None, lowercase=True)
tok.pre_tokenizer = pre_tokenizers.BertPreTokenizer()

CASES = [
  "", "   ", "\t\n", "hello", "Hello World", "HELLO   world",
  "where did he work", "Dräger", "DRÄGER", "naïve café résumé",
  "don't", "multi-space   between", "a,b;c!d?e", "(parentheses)", "[brackets]",
  "under_score", "dash-case", "CamelCaseIdentifier", "snake_case_name",
  "https://example.com/path?q=1", "someone@example.com",
  "123", "3.14159", "1,000,000", "v2.0.1",
  "C++", "C#", "#hashtag", "$dollar", "100%", "a&b", "x|y", "~tilde~", "back`tick`",
  "dungeons and dragons command line tool",
  "industrial software shift handover",
  "What programming languages does Tom know?",
  "supercalifragilisticexpialidocious",
  "unpronounceablegibberishwordthatisnotreal",
  "日本語", "中文字符", "emoji 🎉 test", "Ünïcödé", "ß straße", "Ελληνικά", "русский",
  "  leading and trailing  ",
  "line1\nline2\r\nline3",
  "a" * 120,
  "## Markdown heading", "**bold** _italic_", "`code`", "<div class=\"x\">",
  "TypeScript React Vite",
]

out = []
for c in CASES:
    out.append({"text": c, "tokens": tok.encode(c, add_special_tokens=False).tokens})

json.dump(out, open("src/utils/model2vec.fixture.json", "w"), ensure_ascii=False, indent=1)
print("wrote", len(out), "cases")
