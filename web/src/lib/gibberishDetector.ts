// ── Gibberish / keyboard-mash detection ──────────────────────────────────────
// Detects whether a prompt is likely gibberish (cat walking, baby smashing, etc.)
// vs. a coherent prompt in any language. Pure function — no external dependencies.

type KeyPos = { row: number; pos: number };
const KEY_POSITIONS: Record<string, KeyPos> = {};
(["qwertyuiop", "asdfghjkl", "zxcvbnm"] as const).forEach((row, rowIdx) => {
  [...row].forEach((char, pos) => {
    KEY_POSITIONS[char] = { row: rowIdx, pos };
  });
});

function keyboardMashStreak(s: string): number {
  let streak = 0;
  let max = 0;
  for (let i = 0; i < s.length - 1; i++) {
    const a = KEY_POSITIONS[s[i]];
    const b = KEY_POSITIONS[s[i + 1]];
    if (a && b && a.row === b.row && Math.abs(a.pos - b.pos) <= 2) {
      if (++streak > max) max = streak;
    } else {
      streak = 0;
    }
  }
  return max;
}

export function isGibberish(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 8) return false;

  // Non-ASCII → likely a real non-Latin script, not garbage
  if ([...trimmed].some((char) => char.charCodeAt(0) > 0x7f)) return false;

  // Code / technical indicators → intentional
  if (/[{}()[\]<>/\\]/.test(trimmed)) return false;
  if (/https?:\/\//.test(trimmed)) return false;
  if (/\b\d{3,}\b/.test(trimmed)) return false;

  const lower = trimmed.toLowerCase();
  const words = lower.split(/\s+/);
  const letters = lower.replace(/[^a-z]/g, "");
  if (letters.length < 6) return false;

  let score = 0;

  // Long single token with no spaces — primary cat-walk signal
  if (words.length === 1) {
    score += letters.length >= 14 ? 4 : letters.length >= 8 ? 2 : 0;
  }

  // Keyboard row adjacency mash
  const mash = keyboardMashStreak(letters);
  score += mash >= 5 ? 4 : mash >= 3 ? 1 : 0;

  // Near-zero vowel ratio (consonant clusters)
  const vowelCount = (letters.match(/[aeiou]/g) ?? []).length;
  const vowelRatio = vowelCount / letters.length;
  score += vowelRatio < 0.06 ? 3 : vowelRatio < 0.1 ? 1 : 0;

  // Single character dominates (> 35% of the string)
  const freq: Record<string, number> = {};
  for (const c of letters) freq[c] = (freq[c] ?? 0) + 1;
  const maxFreq = Math.max(...Object.values(freq));
  if (maxFreq / letters.length > 0.35) score += 2;

  // Multiple words but none look like real words (have vowels, reasonable length)
  if (words.length >= 3) {
    const plausible = words.filter(
      (w) => w.length > 1 && /[aeiou]/.test(w) && w.length <= 14,
    );
    if (plausible.length / words.length < 0.25) score += 2;
  }

  return score >= 4;
}

// ── Cat messages ─────────────────────────────────────────────────────────────
// Each entry: free (no API cost) vs paid (real money on the line).
// [Provider] is replaced at call-time with the provider label.

const CAT_MESSAGES: Record<string, { free: string; paid: string }> = {
  en: {
    free: `## 🐾 Your cat has submitted a prompt

We appreciate the creative input, but RyFine is only fluent in Human. Your feline has produced a remarkable specimen of keyboard art — unfortunately not a refineable prompt.

**Silver lining:** you're on a free model, so this cost you absolutely nothing. Your cat, however, owes you an apology and probably some rent.`,

    paid: `## 💸🐾 Your cat nearly expensed a prompt refinement

We intercepted a keyboard masterpiece *before* **[Provider]** could charge you for it. Cats are creative, charismatic, and entirely unaccountable. We are none of those things — but we did just save you money.

Please go reclaim your keyboard. Negotiations may involve treats.`,
  },

  es: {
    free: `## 🐾 Tu gato ha tomado el control del teclado

Ha compuesto su opus magna en gatés clásico. Lamentablemente, RyFine solo habla humano — el gatés está en nuestra hoja de ruta, pero no en la próxima versión.

**Buenas noticias:** modelo gratuito, cartera intacta. Tu dignidad, sin embargo, es otro asunto.`,

    paid: `## 💸🐾 Tu gato casi te factura una refinamiento

Hemos bloqueado el ataque felino *justo antes* de que **[Provider]** te cobrara. Los gatos no asumen responsabilidades económicas — nosotros sí te protegemos.

Ve a recuperar el teclado. Quizás con un par de croquetas como moneda de cambio.`,
  },

  fr: {
    free: `## 🐾 Votre chat a réquisitionné le clavier

Il s'est exprimé en félin classique — une langue que RyFine ne maîtrise pas encore. Nous respectons l'œuvre, mais nous ne pouvons pas la raffiner.

**Bonne nouvelle :** modèle gratuit, portefeuille intact. Votre crédibilité professionnelle, en revanche, dépend entièrement de ce que votre chat fera ensuite.`,

    paid: `## 💸🐾 Votre chat a failli vous coûter de l'argent réel

Nous avons intercepté la tentative féline avant que **[Provider]** ne vous envoie une facture. Les chats n'ont aucune responsabilité fiscale — c'est bien connu.

Reprenez le contrôle du clavier. Peut-être avec une croquette en guise de traité de paix.`,
  },

  de: {
    free: `## 🐾 Ihre Katze hat die Tastatur übernommen

Sie hat ein Werk in Katzisch verfasst — einer Sprache, die RyFine leider nicht beherrscht. Wir respektieren den künstlerischen Ausdruck, können ihn jedoch nicht verfeinern.

**Gute Nachricht:** kostenloser Tarif, Finanzen unversehrt. Ihre Tastaturhoheit liegt derzeit allerdings noch im Verhandlungsbereich.`,

    paid: `## 💸🐾 Ihre Katze hat beinahe echtes Geld ausgegeben

Wir haben den Katzenangriff abgewehrt, *bevor* **[Provider]** eine Rechnung ausstellen konnte. Katzen übernehmen keinerlei finanzielle Verantwortung — wir hingegen schon.

Sichern Sie die Tastatur. Notfalls mit Leckerlis als Verhandlungsmasse.`,
  },

  ja: {
    free: `## 🐾 猫がキーボードを占拠しました

猫語の傑作を拝見しました。しかしRyFineは人間語のみ対応しています。

**ご安心ください：** 無料モデルのため、お財布への被害はゼロです。キーボードの支配権については、猫と交渉してみてください。おやつが有効かもしれません。`,

    paid: `## 💸🐾 猫が課金しようとしました

**[Provider]** に請求が発生する前に、猫の入力を阻止しました。猫は経済的責任を一切負いません。私たちがお守りしました。

今すぐキーボードを奪還してください。猫おやつを交渉材料にどうぞ。`,
  },

  pt: {
    free: `## 🐾 Seu gato assumiu o teclado

Ele compôs uma obra-prima em gatês ancestral. O RyFine só fala humano, infelizmente — mas admiramos a criatividade felina.

**Boa notícia:** modelo gratuito, sem dano financeiro. Seu teclado, no entanto, ainda está refém. Uma negociação com petiscos pode ser necessária.`,

    paid: `## 💸🐾 Seu gato quase gastou dinheiro real

Interceptamos o ataque felino *antes* de a **[Provider]** te cobrar. Gatos não pagam contas — nós te protegemos.

Vai lá recuperar o teclado. Com um petisco na mão, as chances de sucesso aumentam consideravelmente.`,
  },

  it: {
    free: `## 🐾 Il tuo gatto ha preso il controllo della tastiera

Ha composto il suo capolavoro in gattese antico. RyFine parla solo umano, purtroppo.

**Lieto fine:** modello gratuito, portafoglio salvo. La tua autorità sulla tastiera è in discussione, ma almeno non ci sono danni economici. Tratta con il gatto — forse con delle crocchette.`,

    paid: `## 💸🐾 Il tuo gatto stava per farti spendere soldi veri

Abbiamo bloccato l'attacco felino *prima* che **[Provider]** ti addebitasse qualcosa. I gatti non si fanno carico di nessuna responsabilità finanziaria — noi sì.

Riprendi subito il controllo della tastiera. Le crocchette funzionano come valuta diplomatica.`,
  },

  nl: {
    free: `## 🐾 Je kat heeft het toetsenbord overgenomen

Een meesterwerk in oud-Kattentaal. RyFine spreekt helaas alleen menselijk.

**Goed nieuws:** gratis model, portemonnee veilig. Je gezag over het toetsenbord staat echter ter discussie. Een brokje als onderhandelingsmiddel kan wonderen doen.`,

    paid: `## 💸🐾 Je kat probeerde echt geld uit te geven

We blokkeerden de katteninval *voordat* **[Provider]** je kon factureren. Katten nemen geen financiële verantwoordelijkheid — wij wel.

Heroveer je toetsenbord. Breng brokjes mee voor de onderhandelingen.`,
  },

  ru: {
    free: `## 🐾 Ваш кот захватил клавиатуру

Он создал шедевр на кошачьем языке. RyFine, к сожалению, понимает только человеческий.

**Хорошая новость:** бесплатная модель — кошелёк цел. Суверенитет над клавиатурой пока под вопросом, но хотя бы без финансовых потерь. Переговоры с котом рекомендуем начать с угощения.`,

    paid: `## 💸🐾 Ваш кот чуть не потратил ваши деньги

Мы заблокировали кошачью атаку *до того*, как **[Provider]** успел выставить счёт. Коты не несут финансовой ответственности — мы несём.

Немедленно отвоюйте клавиатуру. Угощение как дипломатический инструмент настоятельно рекомендуется.`,
  },

  zh: {
    free: `## 🐾 您的猫占领了键盘

它用古典猫语写了一篇杰作。RyFine只懂人类语言，非常抱歉。

**好消息：** 免费模式，钱包完好无损。不过键盘的控制权还在猫咪手中。建议用零食展开谈判。`,

    paid: `## 💸🐾 您的猫差点花掉您的钱

我们在**[Provider]**向您收费之前拦截了猫咪的攻击。猫不承担任何经济责任——我们替您守住了钱包。

请立即夺回键盘控制权。零食是谈判的有效筹码。`,
  },

  ko: {
    free: `## 🐾 고양이가 키보드를 점령했습니다

고양이가 고양이어로 걸작을 남겼습니다. RyFine은 인간 언어만 이해합니다.

**다행입니다:** 무료 모델이라 지갑은 안전합니다. 다만 키보드 지배권은 아직 협상 중입니다. 간식을 외교 도구로 활용해 보세요.`,

    paid: `## 💸🐾 고양이가 실제 돈을 쓰려 했습니다

**[Provider]**에서 요금이 청구되기 전에 차단했습니다. 고양이는 재정적 책임을 지지 않습니다. 우리가 지켰습니다.

지금 당장 키보드를 되찾으세요. 간식을 협상 카드로 준비하세요.`,
  },
};

function getLanguageKey(lang: string): string {
  const key = lang.slice(0, 2).toLowerCase();
  return key in CAT_MESSAGES ? key : "en";
}

export function getCatMessage(
  browserLanguage: string,
  tier: "free" | "paid",
  providerLabel: string,
): string {
  const msgs =
    CAT_MESSAGES[getLanguageKey(browserLanguage)] ?? CAT_MESSAGES["en"];
  return (tier === "paid" ? msgs.paid : msgs.free).replace(
    "[Provider]",
    providerLabel,
  );
}
