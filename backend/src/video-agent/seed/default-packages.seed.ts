import type { Prisma } from '@prisma/client';

export const DEFAULT_PACKAGES: Omit<Prisma.CreativePackageCreateInput, 'projects'>[] = [
  {
    id: 'pkg-cyberpunk-001',
    name: '赛博朋克都市',
    description: '霓虹灯、雨夜、高楼、2077 年代感。',
    source: 'static',
    characters: [
      {
        name: '都市猎人',
        appearancePrompt:
          'cyberpunk mercenary, neon-lit face, augmented eyes, dark trench coat, rain-soaked',
      },
    ] as Prisma.InputJsonValue,
    worldStyle: {
      colorTone: 'dark cyan-purple neon',
      era: '2077 dystopian future',
      atmosphere: 'rainy night, neon reflections, high-tech low-life',
      sceneKeywords: ['neon signs', 'rain', 'skyscrapers', 'holographic ads', 'crowded streets'],
    } as Prisma.InputJsonValue,
    stylePreset: {
      shotStyle: 'push in',
      aspectRatio: '16:9',
      resolution: '1080p',
      duration: 5,
    } as Prisma.InputJsonValue,
  },
  {
    id: 'pkg-xianxia-001',
    name: '古风仙侠',
    description: '竹林、云雾、古建筑与飘逸仙气。',
    source: 'static',
    characters: [
      {
        name: '仙侠剑客',
        appearancePrompt:
          'ancient Chinese xianxia swordsman, white flowing robes, long black hair, jade hairpin, ethereal aura',
      },
    ] as Prisma.InputJsonValue,
    worldStyle: {
      colorTone: 'warm ink wash, misty jade green',
      era: 'ancient China, mythical era',
      atmosphere: 'ethereal, serene, mystical',
      sceneKeywords: ['bamboo forest', 'mountain mist', 'ancient pavilion', 'cherry blossoms', 'floating islands'],
    } as Prisma.InputJsonValue,
    stylePreset: {
      shotStyle: 'pull back',
      aspectRatio: '16:9',
      resolution: '1080p',
      duration: 6,
    } as Prisma.InputJsonValue,
  },
  {
    id: 'pkg-urban-daily-001',
    name: '现代都市日常',
    description: '咖啡馆、街道、阳光与轻松生活感。',
    source: 'static',
    characters: [] as Prisma.InputJsonValue,
    worldStyle: {
      colorTone: 'warm white, golden hour',
      era: 'contemporary urban',
      atmosphere: 'cozy, warm, slice-of-life',
      sceneKeywords: ['coffee shop', 'city street', 'sunlight', 'pedestrians', 'storefronts'],
    } as Prisma.InputJsonValue,
    stylePreset: {
      shotStyle: 'hand-held',
      aspectRatio: '16:9',
      resolution: '720p',
      duration: 5,
    } as Prisma.InputJsonValue,
  },
];
