import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import type { CreativePackage, Prisma } from '@prisma/client';
import { PrismaService } from '../infra/prisma.service';
import { DEFAULT_PACKAGES } from './seed/default-packages.seed';
import type {
  CharacterAsset,
  CreativePackageDto,
  StylePreset,
  WorldStyle,
} from './video-agent.types';
import type { CreateCreativePackageDto } from './dto/create-creative-package.dto';
import type { UpdateCreativePackageDto } from './dto/update-creative-package.dto';

const DEFAULT_WORLD_STYLE: WorldStyle = {
  colorTone: '',
  era: '',
  atmosphere: '',
  sceneKeywords: [],
};

const DEFAULT_STYLE_PRESET: StylePreset = {
  shotStyle: 'static',
  aspectRatio: '16:9',
  resolution: '720p',
  duration: 5,
};

@Injectable()
export class CreativePackageService implements OnModuleInit {
  private readonly logger = new Logger(CreativePackageService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.seedDefaultPackages();
  }

  async findAll(): Promise<CreativePackageDto[]> {
    const packages = await this.prisma.creativePackage.findMany({
      orderBy: [{ source: 'asc' }, { createdAt: 'asc' }],
    });
    return packages.map((pkg) => this.toDto(pkg));
  }

  async findOne(id: string): Promise<CreativePackageDto> {
    const pkg = await this.prisma.creativePackage.findUnique({
      where: { id },
    });
    if (!pkg) {
      throw new NotFoundException(`creative package ${id} not found`);
    }
    return this.toDto(pkg);
  }

  async create(dto: CreateCreativePackageDto): Promise<CreativePackageDto> {
    const pkg = await this.prisma.creativePackage.create({
      data: {
        name: dto.name,
        description: dto.description,
        coverImage: dto.coverImage,
        source: dto.source ?? 'user',
        characters: (dto.characters ?? []) as unknown as Prisma.InputJsonValue,
        worldStyle: (dto.worldStyle ?? {}) as unknown as Prisma.InputJsonValue,
        stylePreset: (dto.stylePreset ?? {}) as unknown as Prisma.InputJsonValue,
      },
    });
    return this.toDto(pkg);
  }

  async update(id: string, dto: UpdateCreativePackageDto): Promise<CreativePackageDto> {
    await this.findOne(id);
    const pkg = await this.prisma.creativePackage.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.coverImage !== undefined ? { coverImage: dto.coverImage } : {}),
        ...(dto.source !== undefined ? { source: dto.source } : {}),
        ...(dto.characters !== undefined
          ? { characters: dto.characters as unknown as Prisma.InputJsonValue }
          : {}),
        ...(dto.worldStyle !== undefined
          ? { worldStyle: dto.worldStyle as unknown as Prisma.InputJsonValue }
          : {}),
        ...(dto.stylePreset !== undefined
          ? { stylePreset: dto.stylePreset as unknown as Prisma.InputJsonValue }
          : {}),
      },
    });
    return this.toDto(pkg);
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.prisma.creativePackage.delete({
      where: { id },
    });
  }

  private async seedDefaultPackages(): Promise<void> {
    for (const pkg of DEFAULT_PACKAGES) {
      await this.prisma.creativePackage.upsert({
        where: { id: pkg.id as string },
        update: {},
        create: pkg,
      });
    }
    this.logger.log('default creative packages ready');
  }

  private toDto(pkg: CreativePackage): CreativePackageDto {
    return {
      id: pkg.id,
      name: pkg.name,
      description: pkg.description ?? undefined,
      coverImage: pkg.coverImage ?? undefined,
      source: pkg.source,
      characters: this.normalizeCharacters(pkg.characters),
      worldStyle: this.normalizeWorldStyle(pkg.worldStyle),
      stylePreset: this.normalizeStylePreset(pkg.stylePreset),
      createdAt: pkg.createdAt.toISOString(),
      updatedAt: pkg.updatedAt.toISOString(),
    };
  }

  private normalizeCharacters(raw: Prisma.JsonValue): CharacterAsset[] {
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw
      .filter((item): item is Prisma.JsonObject => this.isJsonObject(item))
      .map((item) => ({
        name: typeof item.name === 'string' ? item.name : '未命名角色',
        appearancePrompt:
          typeof item.appearancePrompt === 'string' ? item.appearancePrompt : '',
        ...(typeof item.referenceImageUrl === 'string'
          ? { referenceImageUrl: item.referenceImageUrl }
          : {}),
      }));
  }

  private normalizeWorldStyle(raw: Prisma.JsonValue): WorldStyle {
    const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    return {
      colorTone:
        typeof value.colorTone === 'string' ? value.colorTone : DEFAULT_WORLD_STYLE.colorTone,
      era: typeof value.era === 'string' ? value.era : DEFAULT_WORLD_STYLE.era,
      atmosphere:
        typeof value.atmosphere === 'string'
          ? value.atmosphere
          : DEFAULT_WORLD_STYLE.atmosphere,
      sceneKeywords: Array.isArray(value.sceneKeywords)
        ? value.sceneKeywords.filter((item): item is string => typeof item === 'string')
        : DEFAULT_WORLD_STYLE.sceneKeywords,
    };
  }

  private normalizeStylePreset(raw: Prisma.JsonValue): StylePreset {
    const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    return {
      shotStyle:
        typeof value.shotStyle === 'string'
          ? value.shotStyle
          : DEFAULT_STYLE_PRESET.shotStyle,
      aspectRatio:
        typeof value.aspectRatio === 'string'
          ? value.aspectRatio
          : DEFAULT_STYLE_PRESET.aspectRatio,
      resolution:
        typeof value.resolution === 'string'
          ? value.resolution
          : DEFAULT_STYLE_PRESET.resolution,
      duration:
        typeof value.duration === 'number' ? value.duration : DEFAULT_STYLE_PRESET.duration,
    };
  }

  private isJsonObject(value: Prisma.JsonValue): value is Prisma.JsonObject {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }
}
