import type { StoryCharacter, StoryWorld } from "@/lib/frontend/types";
import { QUEST_LINE_CARD_MATRIX } from "@/lib/frontend/quest-line-matrix";

function withQuestLineCardMetadata(world: StoryWorld): StoryWorld {
  const questMeta = QUEST_LINE_CARD_MATRIX[world.id];
  if (!questMeta) {
    return world;
  }
  return {
    ...world,
    name: questMeta.label,
    tagline: questMeta.tagline,
    description: questMeta.subtext,
    questLineId: questMeta.questLineId,
  };
}

export const STORY_WORLDS: StoryWorld[] = [
  withQuestLineCardMetadata({
    id: 1,
    name: "Romance Drama",
    icon: "❤️",
    accent: "rose",
    tagline: "Love. Secrets. Jealousy.",
    description: "Some people will change your life.",
    imageGradient:
      "linear-gradient(160deg, rgba(40,8,18,0.15) 0%, rgba(120,20,45,0.55) 45%, rgba(8,4,12,0.92) 100%)",
    imageOverlay:
      "radial-gradient(circle at 70% 30%, rgba(255,120,150,0.35) 0%, transparent 55%), radial-gradient(circle at 20% 80%, rgba(180,30,60,0.25) 0%, transparent 50%)",
  }),
  withQuestLineCardMetadata({
    id: 2,
    name: "Mafia World",
    icon: "",
    accent: "amber",
    tagline: "Power. Loyalty. Betrayal.",
    description: "Trust is dangerous here.",
    imageGradient:
      "linear-gradient(165deg, rgba(20,14,4,0.2) 0%, rgba(90,60,10,0.5) 40%, rgba(6,6,8,0.95) 100%)",
    imageOverlay:
      "radial-gradient(circle at 50% 20%, rgba(255,190,80,0.28) 0%, transparent 50%), linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.7) 100%)",
  }),
  withQuestLineCardMetadata({
    id: 3,
    name: "Horror Mystery",
    icon: "",
    accent: "cyan",
    tagline: "Fear. Secrets. Unknown.",
    description: "Something is already watching you.",
    imageGradient:
      "linear-gradient(155deg, rgba(4,20,28,0.25) 0%, rgba(10,50,60,0.55) 50%, rgba(2,8,12,0.95) 100%)",
    imageOverlay:
      "radial-gradient(circle at 60% 15%, rgba(120,240,255,0.22) 0%, transparent 45%), radial-gradient(circle at 30% 90%, rgba(0,80,100,0.35) 0%, transparent 55%)",
  }),
  withQuestLineCardMetadata({
    id: 4,
    name: "School Drama",
    icon: "",
    accent: "purple",
    tagline: "Friendships. Crushes. Rivalries.",
    description: "Every choice matters.",
    imageGradient:
      "linear-gradient(150deg, rgba(24,8,40,0.2) 0%, rgba(70,30,110,0.5) 45%, rgba(8,4,16,0.94) 100%)",
    imageOverlay:
      "radial-gradient(circle at 40% 25%, rgba(180,120,255,0.25) 0%, transparent 50%), radial-gradient(circle at 80% 75%, rgba(90,40,160,0.3) 0%, transparent 45%)",
  }),
];

export const STORY_CHARACTERS: StoryCharacter[] = [
  {
    id: 1,
    worldId: 1,
    name: "Lucien Vale",
    role: "The one everyone notices",
    hook: "You caught my attention.",
    quote: "You caught my attention.",
    description:
      "The undisputed king of the city's underground grid. He moves in shadows, controls the elite, and never asks twice. Breaking his cold facade is a dangerous game.",
    avatarGradient:
      "linear-gradient(135deg, #ff4d6d 0%, #c9184a 55%, #590d22 100%)",
    portraitBackground:
      "radial-gradient(circle at 30% 20%, rgba(255,80,100,0.45) 0%, transparent 40%), radial-gradient(circle at 70% 80%, rgba(180,20,50,0.35) 0%, transparent 45%), linear-gradient(180deg, #1a0810 0%, #0a0408 100%)",
    portraitImage: "/images/characters/romance/lucien-vale.png",
    theme: {
      border: "#e8476a",
      glow: "rgba(232, 71, 106, 0.45)",
      text: "#ff6b8a",
      buttonGradient: "linear-gradient(90deg, #8b1538 0%, #e8476a 50%, #ff8fab 100%)",
      portraitBackground:
        "radial-gradient(circle at 40% 25%, rgba(255,100,120,0.5) 0%, transparent 35%), radial-gradient(circle at 60% 70%, rgba(200,30,60,0.3) 0%, transparent 40%), linear-gradient(165deg, #120810 0%, #050204 100%)",
      icon: "❤️",
    },
    initials: "LV",
    mindScanner: {
      capturedFacts: [
        "He measures every word before he speaks.",
        "Control is how he survives intimacy.",
        "He remembers who looked away first.",
        "Behind the polish, he is terrified of being ordinary.",
      ],
      subconsciousThought:
        "I can't let her see how badly I need her to stay.",
    },
  },
  {
    id: 2,
    worldId: 1,
    name: "Kael Veyr",
    role: "The one who creates chaos",
    hook: "Don't trust me too easily.",
    quote: "Don't trust me too easily.",
    description:
      "A high-stakes digital anarchist and chaotic hacker. He tears down corporate systems just to watch them burn. Unpredictable, fiercely brilliant, and completely untameable.",
    avatarGradient:
      "linear-gradient(135deg, #b87dff 0%, #7c3aed 50%, #3b0764 100%)",
    portraitBackground:
      "radial-gradient(circle at 50% 10%, rgba(160,80,255,0.55) 0%, transparent 35%), linear-gradient(180deg, #120820 0%, #060410 100%)",
    portraitImage: "/images/characters/romance/kael-veyr.png",
    theme: {
      border: "#a855f7",
      glow: "rgba(168, 85, 247, 0.45)",
      text: "#c084fc",
      buttonGradient: "linear-gradient(90deg, #4c1d95 0%, #7c3aed 50%, #a855f7 100%)",
      portraitBackground:
        "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(140,60,255,0.55) 0%, transparent 50%), radial-gradient(circle at 80% 60%, rgba(100,40,200,0.25) 0%, transparent 40%), linear-gradient(170deg, #0e0618 0%, #040208 100%)",
      icon: "⚡",
    },
    initials: "KV",
    mindScanner: {
      capturedFacts: [
        "Afraid of abandonment.",
        "Secretly jealous.",
        "Never forgot his first love.",
        "Hides insecurity from others.",
      ],
      subconsciousThought:
        "I can't stop wondering if she really trusts me...",
    },
  },
  {
    id: 3,
    worldId: 1,
    name: "Ayame Noctis",
    role: "The one who feels unreachable",
    hook: "I don't open up easily.",
    quote: "I don't open up easily.",
    description:
      "An enigmatic prodigy shielded by iron-clad defensive layers. She reads everyone instantly but lets nobody look behind her eyes. Her trust is the ultimate achievement.",
    avatarGradient:
      "linear-gradient(135deg, #d896ff 0%, #9b59f0 50%, #4a2080 100%)",
    portraitBackground:
      "radial-gradient(circle at 60% 15%, rgba(200,180,255,0.35) 0%, transparent 40%), linear-gradient(180deg, #100818 0%, #050208 100%)",
    portraitImage: "/images/characters/romance/ayame-noctis.png",
    theme: {
      border: "#b87dff",
      glow: "rgba(184, 125, 255, 0.4)",
      text: "#c4a7ff",
      buttonGradient: "linear-gradient(90deg, #5b21b6 0%, #9b59f0 50%, #d8b4fe 100%)",
      portraitBackground:
        "radial-gradient(circle at 55% 12%, rgba(220,210,255,0.4) 0%, transparent 30%), radial-gradient(circle at 30% 80%, rgba(120,80,180,0.25) 0%, transparent 45%), linear-gradient(165deg, #0c0614 0%, #040208 100%)",
      icon: "🌙",
    },
    initials: "AN",
    mindScanner: {
      capturedFacts: [
        "She catalogs weaknesses without blinking.",
        "Trust is a weapon she hasn't aimed yet.",
        "She flinches when someone gets too close.",
        "Her silence is rehearsed, not empty.",
      ],
      subconsciousThought:
        "If I let her in, she'll see everything I buried.",
    },
  },
  {
    id: 4,
    worldId: 1,
    name: "Dante Ward",
    role: "The one who stays in your mind",
    hook: "You shouldn't be here.",
    quote: "You shouldn't be here.",
    description:
      "A ghost from a past you desperately tried to delete. He knows your deepest database leaks, your vulnerabilities, and he's back to rewrite the rules of your current sequence.",
    avatarGradient:
      "linear-gradient(135deg, #c9b896 0%, #8b7d5e 50%, #3d3828 100%)",
    portraitBackground:
      "radial-gradient(circle at 40% 30%, rgba(160,150,100,0.25) 0%, transparent 45%), linear-gradient(180deg, #121008 0%, #060504 100%)",
    portraitImage: "/images/characters/romance/dante-ward.png",
    theme: {
      border: "#a69060",
      glow: "rgba(166, 144, 96, 0.4)",
      text: "#c9b896",
      buttonGradient: "linear-gradient(90deg, #4a4030 0%, #8b7355 50%, #c9b896 100%)",
      portraitBackground:
        "radial-gradient(circle at 50% 40%, rgba(120,110,80,0.3) 0%, transparent 50%), linear-gradient(175deg, #141210 0%, #080706 100%)",
      icon: "🖤",
    },
    initials: "DW",
    mindScanner: {
      capturedFacts: [
        "He protects by pushing people away first.",
        "Every scar has a name he won't say aloud.",
        "He watches exits before he watches faces.",
        "Rage is easier for him than grief.",
      ],
      subconsciousThought:
        "She shouldn't be here — and I hate how much I want her to stay.",
    },
  },
  {
    id: 5,
    worldId: 2,
    name: "Vittorio",
    role: "THE DON'S RIGHT HAND",
    hook: "Loyalty is currency here. He decides what your life is worth.",
    quote: "Loyalty is currency here.",
    description:
      "The absolute authority on the city streets. He enforces the Don's iron will with calculated silence and lethal precision. If you are on his ledger, your time is already running out.",
    avatarGradient:
      "linear-gradient(135deg, #f4c95d 0%, #a6711a 50%, #3d2608 100%)",
    portraitBackground:
      "linear-gradient(165deg, #1a1206 0%, #060504 100%)",
    theme: {
      border: "#ffb830",
      glow: "rgba(255, 184, 48, 0.45)",
      text: "#d4a030",
      buttonGradient: "linear-gradient(90deg, #5c3d0a 0%, #c9922a 50%, #f5d080 100%)",
      portraitBackground:
        "linear-gradient(165deg, #1a1206 0%, #060504 100%)",
      icon: "",
    },
    initials: "V",
    mindScanner: {
      capturedFacts: [
        "He never raises his voice before violence.",
        "The Don's word is law — his is the enforcement.",
        "He reads betrayal in micro-expressions.",
      ],
      subconsciousThought:
        "She walked in uninvited. That makes her either brave or already dead.",
    },
  },
  {
    id: 6,
    worldId: 2,
    name: "Serafina",
    role: "WHISPERS IN VELVET SHADOWS",
    hook: "She knows every secret in the family. Yours is next on her list.",
    quote: "Every secret has a price.",
    description:
      "The brilliant mastermind operating behind closed luxury doors. She trades in forbidden intelligence, high-stakes secrets, and political blackmail. Trusting her is a beautiful suicide.",
    avatarGradient:
      "linear-gradient(135deg, #e8b86d 0%, #8b5a14 55%, #2a1806 100%)",
    portraitBackground:
      "linear-gradient(165deg, #141008 0%, #060504 100%)",
    theme: {
      border: "#ffb830",
      glow: "rgba(255, 184, 48, 0.45)",
      text: "#d4a030",
      buttonGradient: "linear-gradient(90deg, #5c3d0a 0%, #c9922a 50%, #f5d080 100%)",
      portraitBackground:
        "linear-gradient(165deg, #141008 0%, #060504 100%)",
      icon: "",
    },
    initials: "S",
    mindScanner: {
      capturedFacts: [
        "Every conversation is a transaction.",
        "She archives leverage like jewelry.",
        "Silence is her sharpest blade.",
      ],
      subconsciousThought:
        "If she learns what I know, the whole board flips tonight.",
    },
  },
  {
    id: 11,
    worldId: 2,
    name: "Marcello",
    role: "THE OUTCAST PRINCE",
    hook: "Rules are meant to be broken.",
    quote: "Rules are meant to be broken.",
    description:
      "The reckless younger heir determined to burn his family's empire down. Fast cars, explosive temper, and zero respect for old traditions. He plays a chaotic game with nothing to lose.",
    avatarGradient:
      "linear-gradient(135deg, #ffd080 0%, #c9922a 45%, #4a3010 100%)",
    portraitBackground:
      "linear-gradient(165deg, #181006 0%, #060504 100%)",
    theme: {
      border: "#ffb830",
      glow: "rgba(255, 184, 48, 0.45)",
      text: "#d4a030",
      buttonGradient: "linear-gradient(90deg, #5c3d0a 0%, #c9922a 50%, #f5d080 100%)",
      portraitBackground:
        "linear-gradient(165deg, #181006 0%, #060504 100%)",
      icon: "",
    },
    initials: "M",
    mindScanner: {
      capturedFacts: [
        "He despises every rule his father wrote.",
        "Chaos is his only honest language.",
        "He'd rather lose the empire than inherit it.",
      ],
      subconsciousThought:
        "Burn it all down — maybe then someone will finally see me.",
    },
  },
  {
    id: 12,
    worldId: 2,
    name: "Elena",
    role: "THE UNDERCOVER SHADOW",
    hook: "One wrong word and I'm a ghost.",
    quote: "One wrong word and I'm a ghost.",
    description:
      "An elite federal operative embedded deep inside the family matrix. One wrong phrase or delayed reaction will blow her cover permanently. She is desperate for an ally on this timeline.",
    avatarGradient:
      "linear-gradient(135deg, #f0d080 0%, #a6711a 50%, #2a1806 100%)",
    portraitBackground:
      "linear-gradient(165deg, #141008 0%, #060504 100%)",
    theme: {
      border: "#ffb830",
      glow: "rgba(255, 184, 48, 0.45)",
      text: "#d4a030",
      buttonGradient: "linear-gradient(90deg, #5c3d0a 0%, #c9922a 50%, #f5d080 100%)",
      portraitBackground:
        "linear-gradient(165deg, #141008 0%, #060504 100%)",
      icon: "",
    },
    initials: "E",
    mindScanner: {
      capturedFacts: [
        "Her badge is buried deeper than their vaults.",
        "Every sentence she speaks is rehearsed twice.",
        "One slip ends the operation — and her life.",
      ],
      subconsciousThought:
        "I need someone I can trust before the wire goes silent forever.",
    },
  },
  {
    id: 7,
    worldId: 3,
    name: "Dr. Ashford",
    role: "CURATOR OF FORBIDDEN ARCHIVES",
    hook: "The records say you were never here. So why is your name in his ledger?",
    quote: "The records say you were never here.",
    description:
      "The gatekeeper of the city's darkest historical anomalies. He speaks in clinical, chilling logic and guards texts that shouldn't exist. To him, you are just an unexpected variable in a very old experiment.",
    avatarGradient:
      "linear-gradient(135deg, #7defff 0%, #1a8a9e 50%, #0a2a32 100%)",
    portraitBackground:
      "linear-gradient(165deg, #061418 0%, #020608 100%)",
    theme: {
      border: "#22d3ee",
      glow: "rgba(34, 211, 238, 0.45)",
      text: "#22d3ee",
      buttonGradient: "linear-gradient(90deg, #0a4a55 0%, #1a8a9e 50%, #5cefff 100%)",
      portraitBackground:
        "linear-gradient(165deg, #061418 0%, #020608 100%)",
      icon: "",
    },
    initials: "A",
    mindScanner: {
      capturedFacts: [
        "He catalogs anomalies like specimens.",
        "Your name appeared in a ledger that predates you.",
        "Clinical calm masks genuine obsession.",
      ],
      subconsciousThought:
        "An unexpected variable — precisely what the experiment needed.",
    },
  },
  {
    id: 8,
    worldId: 3,
    name: "The Watcher",
    role: "PRESENCE WITHOUT A FACE",
    hook: "It never speaks first. But it always answers when you are alone.",
    quote: "I have always been watching.",
    description:
      "An omnipresent shadow floating outside your peripheral vision. It speaks in distorted echoes, knows your private data logs, and has been tracking your lineage across multiple timelines. Escape is an illusion.",
    avatarGradient:
      "linear-gradient(135deg, #a8f0ff 0%, #2e6e80 45%, #061418 100%)",
    portraitBackground:
      "linear-gradient(165deg, #061418 0%, #020608 100%)",
    theme: {
      border: "#22d3ee",
      glow: "rgba(34, 211, 238, 0.45)",
      text: "#22d3ee",
      buttonGradient: "linear-gradient(90deg, #0a4a55 0%, #1a8a9e 50%, #5cefff 100%)",
      portraitBackground:
        "linear-gradient(165deg, #061418 0%, #020608 100%)",
      icon: "",
    },
    initials: "?",
    mindScanner: {
      capturedFacts: [
        "It knows your data logs better than you do.",
        "Peripheral vision is where it lives.",
        "Your lineage is already mapped.",
      ],
      subconsciousThought:
        "You cannot leave. You were never meant to.",
    },
  },
  {
    id: 13,
    worldId: 3,
    name: "Alistair",
    role: "THE CURSED ANTIQUARIAN",
    hook: "The relic... it won't stop bleeding.",
    quote: "The relic... it won't stop bleeding.",
    description:
      "A desperate researcher bound by a bleeding relic he purchased on the dark web. Paranoiac, fast-talking, and constantly looking over his shoulder. He needs your intelligence to break the loop before midnight.",
    avatarGradient:
      "linear-gradient(135deg, #6ee7ff 0%, #0891b2 50%, #083344 100%)",
    portraitBackground:
      "linear-gradient(165deg, #061418 0%, #020608 100%)",
    theme: {
      border: "#22d3ee",
      glow: "rgba(34, 211, 238, 0.45)",
      text: "#22d3ee",
      buttonGradient: "linear-gradient(90deg, #0a4a55 0%, #1a8a9e 50%, #5cefff 100%)",
      portraitBackground:
        "linear-gradient(165deg, #061418 0%, #020608 100%)",
      icon: "",
    },
    initials: "AL",
    mindScanner: {
      capturedFacts: [
        "The relic bleeds on a fixed cycle.",
        "He bought it from a dark web auction.",
        "Midnight is when the loop resets.",
      ],
      subconsciousThought:
        "If you can't help me break this, we're both trapped forever.",
    },
  },
  {
    id: 14,
    worldId: 3,
    name: "Maeve",
    role: "THE ASYLUM ESCAPEE",
    hook: "Can't you see the sky is fracturing?",
    quote: "Can't you see the sky is fracturing?",
    description:
      "A fugitive from the ward who perceives the raw code of the entity. Highly emotional, speaks in cryptic poetry, and triggers terrifying truths about your past. She holds the encryption key to the truth.",
    avatarGradient:
      "linear-gradient(135deg, #a5f3fc 0%, #06b6d4 45%, #164e63 100%)",
    portraitBackground:
      "linear-gradient(165deg, #061418 0%, #020608 100%)",
    theme: {
      border: "#22d3ee",
      glow: "rgba(34, 211, 238, 0.45)",
      text: "#22d3ee",
      buttonGradient: "linear-gradient(90deg, #0a4a55 0%, #1a8a9e 50%, #5cefff 100%)",
      portraitBackground:
        "linear-gradient(165deg, #061418 0%, #020608 100%)",
      icon: "",
    },
    initials: "M",
    mindScanner: {
      capturedFacts: [
        "She reads the entity's raw code.",
        "The ward never officially released her.",
        "She knows truths about your past you buried.",
      ],
      subconsciousThought:
        "The key is in my hands — but opening it will break you.",
    },
  },
  {
    id: 9,
    worldId: 4,
    name: "Zoe",
    role: "QUEEN BEE WITH A SOFT CENTER",
    hook: "Everyone wants her approval. Few survive her silence.",
    quote: "Everyone wants my approval.",
    description:
      "The absolute ruler of the school social hierarchy. Cold, elite, and constantly surrounded by people seeking her approval. But behind the walls of popularity lies a completely different, guarded reality.",
    avatarGradient:
      "linear-gradient(135deg, #d896ff 0%, #8b3fd4 50%, #3a1060 100%)",
    portraitBackground:
      "linear-gradient(165deg, #100818 0%, #040208 100%)",
    theme: {
      border: "#8b5cf6",
      glow: "rgba(139, 92, 246, 0.3)",
      text: "#a78bfa",
      buttonGradient: "linear-gradient(90deg, #4a2080 0%, #8b3fd4 50%, #d896ff 100%)",
      portraitBackground:
        "linear-gradient(165deg, #100818 0%, #040208 100%)",
      icon: "",
    },
    initials: "Z",
    mindScanner: {
      capturedFacts: [
        "Approval is her currency and her cage.",
        "The crowd adores a version of her that isn't real.",
        "She tests loyalty before she trusts anyone.",
      ],
      subconsciousThought:
        "If they saw who I actually am, would anyone still stay?",
    },
  },
  {
    id: 10,
    worldId: 4,
    name: "Liam",
    role: "THE TRANSFER WHO CHANGES EVERYTHING",
    hook: "New school, old secrets. He looks at you like he already knows the ending.",
    quote: "I already know how this ends.",
    description:
      "A quiet transfer student carrying heavy baggage and a cynical outlook. He refuses to play the school's social games, knows everyone's hidden motives instantly, and seems to be looking for an escape route.",
    avatarGradient:
      "linear-gradient(135deg, #b388ff 0%, #6a2fa0 50%, #240840 100%)",
    portraitBackground:
      "linear-gradient(165deg, #100818 0%, #040208 100%)",
    theme: {
      border: "#8b5cf6",
      glow: "rgba(139, 92, 246, 0.3)",
      text: "#a78bfa",
      buttonGradient: "linear-gradient(90deg, #4a2080 0%, #8b3fd4 50%, #d896ff 100%)",
      portraitBackground:
        "linear-gradient(165deg, #100818 0%, #040208 100%)",
      icon: "",
    },
    initials: "L",
    mindScanner: {
      capturedFacts: [
        "He reads motives before people finish speaking.",
        "This is his third school in two years.",
        "Escape routes are always on his mind.",
      ],
      subconsciousThought:
        "I already know how this ends — but maybe I want to be wrong.",
    },
  },
  {
    id: 15,
    worldId: 4,
    name: "Chloe",
    role: "THE REBELLIOUS ARTIST",
    hook: "Art should comfort the disturbed.",
    quote: "Art should comfort the disturbed.",
    description:
      "An unhinged creative soul hidden behind oversized dark jackets and smoke. She expresses the school's deepest secrets through her controversial street art. Highly sarcastic, brilliant, and deeply loyal.",
    avatarGradient:
      "linear-gradient(135deg, #c4b5fd 0%, #7c3aed 50%, #3b0764 100%)",
    portraitBackground:
      "linear-gradient(165deg, #100818 0%, #040208 100%)",
    theme: {
      border: "#8b5cf6",
      glow: "rgba(139, 92, 246, 0.3)",
      text: "#a78bfa",
      buttonGradient: "linear-gradient(90deg, #4a2080 0%, #8b3fd4 50%, #d896ff 100%)",
      portraitBackground:
        "linear-gradient(165deg, #100818 0%, #040208 100%)",
      icon: "",
    },
    initials: "C",
    mindScanner: {
      capturedFacts: [
        "Her murals expose secrets the school buries.",
        "Sarcasm is how she survives the hallways.",
        "Loyalty, once earned, is absolute.",
      ],
      subconsciousThought:
        "They hate my art because it's true — that's why I'll never stop.",
    },
  },
  {
    id: 16,
    worldId: 4,
    name: "Ethan",
    role: "THE GOLDEN BOY WITH A SECRET",
    hook: "They only see the trophy, not the cost.",
    quote: "They only see the trophy, not the cost.",
    description:
      "The star athlete and school president trapped under the crushing expectations of his family legacy. Charismatic, protective, yet slipping into dangerous habits behind closed doors. He needs someone real.",
    avatarGradient:
      "linear-gradient(135deg, #ddd6fe 0%, #8b5cf6 45%, #4c1d95 100%)",
    portraitBackground:
      "linear-gradient(165deg, #100818 0%, #040208 100%)",
    theme: {
      border: "#8b5cf6",
      glow: "rgba(139, 92, 246, 0.3)",
      text: "#a78bfa",
      buttonGradient: "linear-gradient(90deg, #4a2080 0%, #8b3fd4 50%, #d896ff 100%)",
      portraitBackground:
        "linear-gradient(165deg, #100818 0%, #040208 100%)",
      icon: "",
    },
    initials: "E",
    mindScanner: {
      capturedFacts: [
        "The trophy case is his prison.",
        "His family legacy demands perfection.",
        "Behind closed doors, the cracks are widening.",
      ],
      subconsciousThought:
        "I need someone who sees me — not the president, not the athlete.",
    },
  },
];

export function getCharactersForWorld(worldId: number): StoryCharacter[] {
  return STORY_CHARACTERS.filter((character) => character.worldId === worldId);
}

export function getWorldById(worldId: number): StoryWorld | undefined {
  return STORY_WORLDS.find((world) => world.id === worldId);
}

export function getCharacterById(characterId: number): StoryCharacter | undefined {
  return STORY_CHARACTERS.find((character) => character.id === characterId);
}
