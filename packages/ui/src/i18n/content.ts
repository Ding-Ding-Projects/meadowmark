/**
 * Copy for game-content display names that come from balance/*.json (crop
 * names, good names, etc). Namespaced under "content.<surface>.<id>.name"
 * so a balance id can never collide with a hand-written UI copy key from
 * another surface (see the module doc in ./index for why namespacing
 * matters).
 *
 * balance/crops.json defines 17 crops; every one of them needs a real,
 * namespaced key here or the crop picker falls back to a humanized guess
 * of the crop id instead of a real translation (see ./index's
 * humanizeMissingKey). Keep this list in sync with balance/crops.json.
 */

import { registerCopy } from "./index";

registerCopy({
  "content.crop.wheat.name": { en: { 1: "Wheat", 3: "Wheat" }, yue: { 1: "小麥", 3: "麥仔" } },
  "content.crop.corn.name": { en: { 1: "Corn", 3: "Corn" }, yue: { 1: "粟米", 3: "粟米仔" } },
  "content.crop.carrot.name": { en: { 1: "Carrot", 3: "Carrot" }, yue: { 1: "紅蘿蔔", 3: "紅蘿蔔仔" } },
  "content.crop.sugarcane.name": { en: { 1: "Sugarcane", 3: "Sugarcane" }, yue: { 1: "甘蔗", 3: "啖啖甜甘蔗" } },
  "content.crop.cotton.name": { en: { 1: "Cotton", 3: "Cotton" }, yue: { 1: "棉花", 3: "軟綿綿棉花" } },
  "content.crop.strawberry.name": { en: { 1: "Strawberry", 3: "Strawberry" }, yue: { 1: "士多啤梨", 3: "士多啤梨" } },
  "content.crop.tomato.name": { en: { 1: "Tomato", 3: "Tomato" }, yue: { 1: "番茄", 3: "紅噹噹番茄" } },
  "content.crop.potato.name": { en: { 1: "Potato", 3: "Potato" }, yue: { 1: "薯仔", 3: "薯仔" } },
  "content.crop.soybean.name": { en: { 1: "Soybean", 3: "Soybean" }, yue: { 1: "黃豆", 3: "黃豆" } },
  "content.crop.rice.name": { en: { 1: "Rice", 3: "Rice" }, yue: { 1: "米", 3: "白米" } },
  "content.crop.pumpkin.name": { en: { 1: "Pumpkin", 3: "Pumpkin" }, yue: { 1: "南瓜", 3: "大大個南瓜" } },
  "content.crop.chilli.name": { en: { 1: "Chilli", 3: "Chilli" }, yue: { 1: "辣椒", 3: "惹味辣椒" } },
  "content.crop.coffee_bean.name": { en: { 1: "Coffee Bean", 3: "Coffee Bean" }, yue: { 1: "咖啡豆", 3: "提神咖啡豆" } },
  "content.crop.lavender.name": { en: { 1: "Lavender", 3: "Lavender" }, yue: { 1: "薰衣草", 3: "香噴噴薰衣草" } },
  "content.crop.grape.name": { en: { 1: "Grape", 3: "Grape" }, yue: { 1: "提子", 3: "一串串提子" } },
  "content.crop.blueberry.name": { en: { 1: "Blueberry", 3: "Blueberry" }, yue: { 1: "藍莓", 3: "藍莓仔" } },
  "content.crop.vanilla.name": { en: { 1: "Vanilla", 3: "Vanilla" }, yue: { 1: "雲呢拿", 3: "香濃雲呢拿" } },
});
