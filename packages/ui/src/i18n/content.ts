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
  // Zoo species (balance/zoo.json)
  "content.zoo.lion.name": { en: { 1: "Lion", 3: "Lion" }, yue: { 1: "獅子", 3: "獸中之王" } },
  "content.zoo.zebra.name": { en: { 1: "Zebra", 3: "Zebra" }, yue: { 1: "斑馬", 3: "間條斑馬" } },
  "content.zoo.elephant.name": { en: { 1: "Elephant", 3: "Elephant" }, yue: { 1: "大象", 3: "大大隻大象" } },
  "content.zoo.flamingo.name": { en: { 1: "Flamingo", 3: "Flamingo" }, yue: { 1: "火烈鳥", 3: "粉紅火烈鳥" } },
  "content.zoo.otter.name": { en: { 1: "Otter", 3: "Otter" }, yue: { 1: "水獺", 3: "得意水獺" } },
  "content.zoo.seal.name": { en: { 1: "Seal", 3: "Seal" }, yue: { 1: "海豹", 3: "肥肥海豹" } },
  "content.zoo.penguin.name": { en: { 1: "Penguin", 3: "Penguin" }, yue: { 1: "企鵝", 3: "撴撴企鵝" } },
  "content.zoo.polar_bear.name": { en: { 1: "Polar Bear", 3: "Polar Bear" }, yue: { 1: "北極熊", 3: "大隻北極熊" } },
  "content.zoo.arctic_fox.name": { en: { 1: "Arctic Fox", 3: "Arctic Fox" }, yue: { 1: "北極狐", 3: "雪白北極狐" } },
  "content.zoo.tiger.name": { en: { 1: "Tiger", 3: "Tiger" }, yue: { 1: "老虎", 3: "惡爆老虎" } },
  "content.zoo.mountain_goat.name": { en: { 1: "Mountain Goat", 3: "Mountain Goat" }, yue: { 1: "山羊", 3: "爬山山羊" } },
  "content.zoo.eagle.name": { en: { 1: "Eagle", 3: "Eagle" }, yue: { 1: "老鷹", 3: "威水老鷹" } },

  // Museum artifacts (balance/museum.json)
  "content.museum.artifact.sundial.name": { en: { 1: "Ancient Sundial", 3: "Ancient Sundial" }, yue: { 1: "古代日晷", 3: "古老日晷" } },
  "content.museum.artifact.totem.name": { en: { 1: "Carved Totem", 3: "Carved Totem" }, yue: { 1: "雕刻圖騰", 3: "雕花圖騰" } },
  "content.museum.artifact.urn.name": { en: { 1: "Painted Urn", 3: "Painted Urn" }, yue: { 1: "彩繪陶罐", 3: "靚彩陶罐" } },
  "content.museum.artifact.tablet.name": { en: { 1: "Stone Tablet", 3: "Stone Tablet" }, yue: { 1: "石碑", 3: "古老石碑" } },
  "content.museum.artifact.crown.name": { en: { 1: "Jeweled Crown", 3: "Jeweled Crown" }, yue: { 1: "寶石皇冠", 3: "閃閃皇冠" } },

  // Museum exhibits (balance/museum.json)
  "content.museum.exhibit.ancient_treasures.name": { en: { 1: "Ancient Treasures", 3: "Ancient Treasures" }, yue: { 1: "古代珍寶", 3: "古老珍寶展" } },
  "content.museum.exhibit.royal_relics.name": { en: { 1: "Royal Relics", 3: "Royal Relics" }, yue: { 1: "皇室遺物", 3: "皇室珍藏" } },
  "content.museum.exhibit.crown_jewels.name": { en: { 1: "Crown Jewels", 3: "Crown Jewels" }, yue: { 1: "皇冠寶石", 3: "至靚皇冠" } },
});
