export function buildShotPlannerPrompt(params: {
  packageName: string;
  colorTone: string;
  era: string;
  atmosphere: string;
  sceneKeywords: string[];
  characters: Array<{ name: string; appearancePrompt: string }>;
  shotStyle: string;
  aspectRatio: string;
  duration: number;
  storyBrief?: string;
}): string {
  const characterSection = params.characters.length
    ? params.characters
        .map((character) => `- ${character.name}: ${character.appearancePrompt}`)
        .join('\n')
    : '- No fixed character. Keep the visual identity consistent across shots.';

  const storyBriefSection = params.storyBrief?.trim()
    ? `## Story Brief\n${params.storyBrief.trim()}\n`
    : '## Story Brief\nCreate a simple but coherent micro-story based on the package.\n';

  return `You are a professional AI video storyboard director.
Design 3 to 5 connected shots for the following creative package and return JSON only.

## Package
- Name: ${params.packageName}

## World
- Color tone: ${params.colorTone}
- Era: ${params.era}
- Atmosphere: ${params.atmosphere}
- Scene keywords: ${params.sceneKeywords.join(', ') || 'none'}

## Characters
${characterSection}

## Style
- Shot style baseline: ${params.shotStyle}
- Aspect ratio: ${params.aspectRatio}
- Default shot duration: ${params.duration} seconds

${storyBriefSection}
## Output Format
Return a JSON array with this shape and no markdown fence:
[
  {
    "shotIndex": 1,
    "description": "English prompt-ready shot description",
    "cameraMovement": "push in",
    "duration": 5
  }
]

Rules:
- description must be English and directly usable for AI video generation
- keep narrative continuity between shots
- each description should include subject, action, environment, and lighting or mood
- cameraMovement must be one of: push in, pull back, pan left, pan right, tilt up, tilt down, static, hand-held`;
}

export function buildFinalPrompt(params: {
  shotDescription: string;
  appearancePrompts: string[];
  colorTone: string;
  atmosphere: string;
  aspectRatio: string;
}): string {
  return [
    params.shotDescription,
    params.appearancePrompts.join(', '),
    params.colorTone,
    params.atmosphere,
    `aspect ratio ${params.aspectRatio}`,
    'cinematic quality, high detail',
  ]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(', ');
}
