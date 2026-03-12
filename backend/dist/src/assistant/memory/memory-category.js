"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WriteDecision = exports.CATEGORY_DUPLICATE_THRESHOLD = exports.CATEGORY_RECALL_WEIGHT = exports.DECAY_CONFIG = exports.COGNITIVE_CATEGORIES = exports.VALID_CATEGORIES = exports.MemoryCategory = void 0;
var MemoryCategory;
(function (MemoryCategory) {
    MemoryCategory["IDENTITY_ANCHOR"] = "identity_anchor";
    MemoryCategory["SHARED_FACT"] = "shared_fact";
    MemoryCategory["COMMITMENT"] = "commitment";
    MemoryCategory["CORRECTION"] = "correction";
    MemoryCategory["SOFT_PREFERENCE"] = "soft_preference";
    MemoryCategory["GENERAL"] = "general";
    MemoryCategory["JUDGMENT_PATTERN"] = "judgment_pattern";
    MemoryCategory["VALUE_PRIORITY"] = "value_priority";
    MemoryCategory["RHYTHM_PATTERN"] = "rhythm_pattern";
    MemoryCategory["COGNITIVE_PROFILE"] = "cognitive_profile";
    MemoryCategory["RELATIONSHIP_STATE"] = "relationship_state";
    MemoryCategory["BOUNDARY_EVENT"] = "boundary_event";
})(MemoryCategory || (exports.MemoryCategory = MemoryCategory = {}));
exports.VALID_CATEGORIES = Object.values(MemoryCategory);
exports.COGNITIVE_CATEGORIES = [
    MemoryCategory.JUDGMENT_PATTERN,
    MemoryCategory.VALUE_PRIORITY,
    MemoryCategory.RHYTHM_PATTERN,
    MemoryCategory.COGNITIVE_PROFILE,
    MemoryCategory.RELATIONSHIP_STATE,
];
exports.DECAY_CONFIG = {
    [MemoryCategory.IDENTITY_ANCHOR]: null,
    [MemoryCategory.SHARED_FACT]: {
        halfLifeDays: 90,
        hitBoost: 0.15,
        minScore: 0.2,
    },
    [MemoryCategory.COMMITMENT]: {
        halfLifeDays: 14,
        hitBoost: 0.1,
        minScore: 0.3,
    },
    [MemoryCategory.CORRECTION]: {
        halfLifeDays: 60,
        hitBoost: 0.2,
        minScore: 0.2,
    },
    [MemoryCategory.SOFT_PREFERENCE]: {
        halfLifeDays: 45,
        hitBoost: 0.1,
        minScore: 0.25,
    },
    [MemoryCategory.GENERAL]: {
        halfLifeDays: 30,
        hitBoost: 0.05,
        minScore: 0.3,
    },
    [MemoryCategory.JUDGMENT_PATTERN]: {
        halfLifeDays: 45,
        hitBoost: 0.1,
        minScore: 0.25,
    },
    [MemoryCategory.VALUE_PRIORITY]: {
        halfLifeDays: 45,
        hitBoost: 0.1,
        minScore: 0.25,
    },
    [MemoryCategory.RHYTHM_PATTERN]: {
        halfLifeDays: 45,
        hitBoost: 0.1,
        minScore: 0.25,
    },
    [MemoryCategory.COGNITIVE_PROFILE]: {
        halfLifeDays: 60,
        hitBoost: 0.12,
        minScore: 0.22,
    },
    [MemoryCategory.RELATIONSHIP_STATE]: {
        halfLifeDays: 30,
        hitBoost: 0.1,
        minScore: 0.28,
    },
    [MemoryCategory.BOUNDARY_EVENT]: {
        halfLifeDays: 21,
        hitBoost: 0.08,
        minScore: 0.3,
    },
};
exports.CATEGORY_RECALL_WEIGHT = {
    [MemoryCategory.IDENTITY_ANCHOR]: 1.0,
    [MemoryCategory.CORRECTION]: 0.9,
    [MemoryCategory.SHARED_FACT]: 0.8,
    [MemoryCategory.SOFT_PREFERENCE]: 0.7,
    [MemoryCategory.JUDGMENT_PATTERN]: 0.75,
    [MemoryCategory.VALUE_PRIORITY]: 0.75,
    [MemoryCategory.RHYTHM_PATTERN]: 0.75,
    [MemoryCategory.COGNITIVE_PROFILE]: 0.78,
    [MemoryCategory.RELATIONSHIP_STATE]: 0.72,
    [MemoryCategory.BOUNDARY_EVENT]: 0.65,
    [MemoryCategory.COMMITMENT]: 0.6,
    [MemoryCategory.GENERAL]: 0.5,
};
exports.CATEGORY_DUPLICATE_THRESHOLD = {
    [MemoryCategory.IDENTITY_ANCHOR]: 0.72,
    [MemoryCategory.CORRECTION]: 0.68,
    [MemoryCategory.SHARED_FACT]: 0.66,
    [MemoryCategory.SOFT_PREFERENCE]: 0.7,
    [MemoryCategory.JUDGMENT_PATTERN]: 0.74,
    [MemoryCategory.VALUE_PRIORITY]: 0.74,
    [MemoryCategory.RHYTHM_PATTERN]: 0.74,
    [MemoryCategory.COGNITIVE_PROFILE]: 0.74,
    [MemoryCategory.RELATIONSHIP_STATE]: 0.72,
    [MemoryCategory.BOUNDARY_EVENT]: 0.7,
    [MemoryCategory.COMMITMENT]: 0.66,
    [MemoryCategory.GENERAL]: 0.64,
};
var WriteDecision;
(function (WriteDecision) {
    WriteDecision["WRITE"] = "write";
    WriteDecision["WRITE_AND_LINK"] = "write_and_link";
    WriteDecision["OVERWRITE"] = "overwrite";
    WriteDecision["MERGE"] = "merge";
    WriteDecision["SKIP"] = "skip";
})(WriteDecision || (exports.WriteDecision = WriteDecision = {}));
//# sourceMappingURL=memory-category.js.map