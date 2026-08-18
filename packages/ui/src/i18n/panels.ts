import { registerCopy } from "./index";

registerCopy({
  // Fields
  "panel.fields.title": { en: { 1: "Fields", 3: "Fields" }, yue: { 1: "農田", 3: "農田" } },
  "panel.fields.gridLabel": { en: { 1: "Field plots" }, yue: { 1: "田格" } },
  "panel.fields.cropPickerLabel": { en: { 1: "Crop to plant", 3: "What are we planting?" }, yue: { 1: "要種嘅作物", 3: "今次種咩好？" } },
  "panel.fields.plantAll": { en: { 1: "Plant all", 3: "Plant everything" }, yue: { 1: "全部種植", 3: "全部種晒佢" } },
  "panel.fields.harvestAll": { en: { 1: "Harvest all", 3: "Harvest everything" }, yue: { 1: "全部收成", 3: "全部收晒佢" } },
  "panel.fields.plotEmpty": { en: { 1: "Plot {index}, empty" }, yue: { 1: "第 {index} 格，空置" } },
  "panel.fields.plotReady": { en: { 1: "Plot {index}, ready to harvest" }, yue: { 1: "第 {index} 格，可以收成" } },
  "panel.fields.plotWithered": { en: { 1: "Plot {index}, withered" }, yue: { 1: "第 {index} 格，枯咗" } },
  "panel.fields.plotGrowing": { en: { 1: "Plot {index}, growing, {remaining} remaining" }, yue: { 1: "第 {index} 格，生長緊，仲有 {remaining}" } },
  "panel.fields.plotEmptyShort": { en: { 1: "Empty" }, yue: { 1: "空置" } },
  "panel.fields.plotWitheredShort": { en: { 1: "Withered" }, yue: { 1: "枯咗" } },

  // Factories
  "panel.factories.title": { en: { 1: "Factories", 3: "Factories" }, yue: { 1: "工廠", 3: "工廠" } },
  "panel.factories.emptySlot": { en: { 1: "Empty — pick a recipe", 3: "Empty — go on, pick something" }, yue: { 1: "空置－揀個配方", 3: "得閒揀個配方啦" } },
  "panel.factories.recipeFilterLabel": { en: { 1: "Search recipes" }, yue: { 1: "搵配方" } },
  "panel.factories.recipeMissingIngredients": { en: { 1: "Missing ingredients", 3: "Not enough stock for this one" }, yue: { 1: "材料唔夠", 3: "貨唔夠喎" } },
  "panel.factories.pausedBarnFull": { en: { 1: "Queue paused: barn full", 3: "Paused — the barn is stuffed full" }, yue: { 1: "已暫停：穀倉爆晒", 3: "暫停緊，穀倉塞到爆" } },
  "panel.factories.viewBarn": { en: { 1: "View barn" }, yue: { 1: "睇穀倉" } },

  // Barn
  "panel.barn.title": { en: { 1: "Barn", 3: "Barn" }, yue: { 1: "穀倉", 3: "穀倉" } },
  "panel.barn.sellPrice": { en: { 1: "Sells for {price}" }, yue: { 1: "賣 {price}" } },
  "panel.barn.sell": { en: { 1: "Sell {amount}", 3: "Sell all {amount}" }, yue: { 1: "賣出 {amount}", 3: "成 {amount} 個賣晒佢" } },
  "panel.barn.upgrade": { en: { 1: "Upgrade — {cost} for {cap} capacity", 3: "Upgrade for {cost} — {cap} slots, baby" }, yue: { 1: "升級 － {cost} 換 {cap} 容量", 3: "畀 {cost} 升級，{cap} 個位任你放" } },
  "panel.barn.maxCapacity": { en: { 1: "Maximum capacity reached", 3: "Barn's as big as it gets" }, yue: { 1: "已達最大容量", 3: "穀倉大到頂喇" } },
  "panel.barn.maxCapacityReason": { en: { 1: "There is no further barn upgrade available." }, yue: { 1: "冇再高嘅升級可以揀。" } },
  "panel.barn.capacityUnknown": { en: { 1: "unknown", 3: "who knows, honestly" }, yue: { 1: "未知", 3: "老實講，唔知" } },
  "panel.barn.capacityLabel": { en: { 1: "Barn storage {used} of {cap}" }, yue: { 1: "穀倉存貨 {used}／{cap}" } },

  // Orders
  "panel.orders.title": { en: { 1: "Orders", 3: "Orders" }, yue: { 1: "訂單", 3: "訂單" } },
  "panel.orders.boardLabel": { en: { 1: "Order board" }, yue: { 1: "訂單板" } },
  "panel.orders.emptySlot": { en: { 1: "No order", 3: "Nothing to fill here right now" }, yue: { 1: "冇訂單", 3: "呢度暫時得閒" } },
  "panel.orders.reward": { en: { 1: "Reward: {coins} coins, {xp} XP, {cash}" }, yue: { 1: "獎勵：{coins} 金幣、{xp} 經驗、{cash}" } },
  "panel.orders.fill": { en: { 1: "Fill order", 3: "Ship it" }, yue: { 1: "填單", 3: "出貨啦" } },
  "panel.orders.cannotFill": { en: { 1: "Not enough goods in the barn yet." }, yue: { 1: "穀倉貨仲未夠。" } },
  "panel.orders.reroll": { en: { 1: "Reroll ({cost})", 3: "Try a different one ({cost})" }, yue: { 1: "換過張 ({cost})", 3: "唔啱換過張 ({cost})" } },
  "panel.orders.rerollUnavailable": { en: { 1: "Reroll unavailable", 3: "Can't swap this one" }, yue: { 1: "暫時唔可以換", 3: "呢張換唔到" } },
  "panel.orders.rerollUnavailableReason": { en: { 1: "This order cannot be rerolled right now." }, yue: { 1: "呢張訂單而家唔可以換過。" } },

  // Train — 3 independent wagons
  "panel.train.title": { en: { 1: "Train", 3: "Train" }, yue: { 1: "火車", 3: "火車" } },
  "panel.train.wagonListLabel": { en: { 1: "Train wagons" }, yue: { 1: "火車車卡" } },
  "panel.train.wagonLabel": { en: { 1: "Wagon {index}", 3: "Wagon {index}" }, yue: { 1: "第 {index} 卡", 3: "第 {index} 卡" } },
  "panel.train.statusLoading": { en: { 1: "Loading", 3: "Loading up" }, yue: { 1: "裝貨緊", 3: "裝緊貨" } },
  "panel.train.statusDeparted": { en: { 1: "Departed", 3: "Chugging along" }, yue: { 1: "已出發", 3: "揸緊車" } },
  "panel.train.statusArrived": { en: { 1: "Arrived — collect your materials", 3: "Home! Go get your materials" }, yue: { 1: "已到達－收取材料", 3: "返到嚟喇，去攞材料啦" } },
  "panel.train.load": { en: { 1: "Load {amount}", 3: "Chuck in {amount}" }, yue: { 1: "裝 {amount}", 3: "掟晒 {amount} 落去" } },
  "panel.train.notEnoughInBarn": { en: { 1: "Not enough of this good in the barn yet." }, yue: { 1: "穀倉呢款貨仲未夠。" } },
  "panel.train.dispatch": { en: { 1: "Dispatch", 3: "Send it off" }, yue: { 1: "出發", 3: "出發啦" } },
  "panel.train.notFullyLoaded": { en: { 1: "This wagon still needs more goods before it can leave." }, yue: { 1: "呢卡車貨仲未夠，未走得。" } },
  "panel.train.collect": { en: { 1: "Collect", 3: "Grab the loot" }, yue: { 1: "收取", 3: "攞晒啲嘢" } },
  "panel.train.rewardMaterials": { en: { 1: "Bringing back: {materials}" }, yue: { 1: "帶緊返嚟：{materials}" } },

  // Helicopter — 2 fast orders, a reputation bar, and a reputation chest
  "panel.helicopter.title": { en: { 1: "Helicopter", 3: "Helicopter" }, yue: { 1: "直昇機", 3: "直昇機" } },
  "panel.helicopter.orderListLabel": { en: { 1: "Helicopter orders" }, yue: { 1: "直昇機訂單" } },
  "panel.helicopter.orderLabel": { en: { 1: "Order {index}", 3: "Order {index}" }, yue: { 1: "第 {index} 張訂單", 3: "第 {index} 張訂單" } },
  "panel.helicopter.refilling": { en: { 1: "Refilling, {remaining} left", 3: "Catching its breath, {remaining} to go" }, yue: { 1: "補緊貨，仲有 {remaining}", 3: "唞緊氣，仲有 {remaining}" } },
  "panel.helicopter.reward": { en: { 1: "Reward: {coins} coins, {stars} reputation star(s)" }, yue: { 1: "獎勵：{coins} 金幣、{stars} 粒信譽星" } },
  "panel.helicopter.fulfill": { en: { 1: "Fulfill", 3: "Send it up" }, yue: { 1: "填單", 3: "送上去" } },
  "panel.helicopter.cannotFulfill": { en: { 1: "Not enough goods in the barn yet." }, yue: { 1: "穀倉貨仲未夠。" } },
  "panel.helicopter.reputationLabel": { en: { 1: "Reputation {bar} / {cap}" }, yue: { 1: "信譽 {bar} / {cap}" } },
  "panel.helicopter.chestReady": { en: { 1: "Reputation chest ready!", 3: "Chest's rattling, open it!" }, yue: { 1: "信譽寶箱準備好喇！", 3: "個箱郁緊，開佢啦！" } },
  "panel.helicopter.chestReward": {
    en: { 1: "Contains: {cash}, {boosterQty}x {booster} booster, {permits} expansion permit(s)" },
    yue: { 1: "內含：{cash}、{boosterQty}個 {booster} 加成、{permits} 張擴地許可證" },
  },
  "panel.helicopter.chestRewardUnknown": { en: { 1: "Reward not yet known — open the chest to find out." }, yue: { 1: "獎勵仲未知－開咗個箱先知。" } },
  "panel.helicopter.openChest": { en: { 1: "Open chest", 3: "Crack it open" }, yue: { 1: "開寶箱", 3: "拆開佢" } },

  // Ship — 6 crates on a rolling 24h window, plus an all-six chest
  "panel.ship.title": { en: { 1: "Ship", 3: "Ship" }, yue: { 1: "船", 3: "船" } },
  "panel.ship.crateListLabel": { en: { 1: "Ship crates" }, yue: { 1: "船運貨箱" } },
  "panel.ship.crateLabel": { en: { 1: "Crate {index}", 3: "Crate {index}" }, yue: { 1: "第 {index} 箱", 3: "第 {index} 箱" } },
  "panel.ship.crateReward": { en: { 1: "Reward: {coins} coins, {xp} XP" }, yue: { 1: "獎勵：{coins} 金幣、{xp} 經驗" } },
  "panel.ship.load": { en: { 1: "Load {amount}", 3: "Chuck in {amount}" }, yue: { 1: "裝 {amount}", 3: "掟晒 {amount} 落去" } },
  "panel.ship.notEnoughInBarn": { en: { 1: "Not enough of this good in the barn yet." }, yue: { 1: "穀倉呢款貨仲未夠。" } },
  "panel.ship.collect": { en: { 1: "Collect", 3: "Grab the loot" }, yue: { 1: "收取", 3: "攞晒啲嘢" } },
  "panel.ship.locked": { en: { 1: "Dock locked" }, yue: { 1: "船塢未開放" } },
  "panel.ship.lockedDetail": { en: { 1: "Reach level 18 to unlock the dock.", 3: "Level up to 18 and the dock's yours." }, yue: { 1: "升到 18 級先解鎖船塢。", 3: "升到 18 級，船塢就係你㗎喇。" } },
  "panel.ship.windowRemaining": { en: { 1: "Window closes in {remaining}" }, yue: { 1: "仲有 {remaining} 就截止" } },
  "panel.ship.windowUnknown": { en: { 1: "No delivery window yet." }, yue: { 1: "仲未有送貨時段。" } },
  "panel.ship.chestReady": { en: { 1: "All six crates delivered — chest ready!", 3: "Six for six, chest's yours!" }, yue: { 1: "六箱貨送晒喇－寶箱準備好！", 3: "六箱全中，寶箱歸你！" } },
  "panel.ship.chestReward": { en: { 1: "Contains: {cash}, {permits} expansion permit(s)" }, yue: { 1: "內含：{cash}、{permits} 張擴地許可證" } },
  "panel.ship.chestRewardUnknown": { en: { 1: "Reward not yet known — open the chest to find out." }, yue: { 1: "獎勵仲未知－開咗個箱先知。" } },
  "panel.ship.openChest": { en: { 1: "Open chest", 3: "Crack it open" }, yue: { 1: "開寶箱", 3: "拆開佢" } },

  // Town
  "panel.town.title": { en: { 1: "Town", 3: "Town" }, yue: { 1: "小鎮", 3: "小鎮" } },
  "panel.town.cost": { en: { 1: "{coins} coins + {cash}" }, yue: { 1: "{coins} 金幣 + {cash}" } },
  "panel.town.place": { en: { 1: "Place", 3: "Plonk it down" }, yue: { 1: "放置", 3: "擺低佢" } },
  "panel.town.noSelection": { en: { 1: "Select a building to see its details.", 3: "Click a building to nose around it." }, yue: { 1: "揀返棟樓睇下詳情。", 3: "撳返棟樓睇下有咩料。" } },
  "panel.town.demolish": { en: { 1: "Demolish", 3: "Wreck it" }, yue: { 1: "拆卸", 3: "拆咗佢" } },
  "panel.town.demolishTitle": { en: { 1: "Demolish {building}?" }, yue: { 1: "拆卸 {building}？" } },
  "panel.town.demolishDetail": { en: { 1: "This permanently removes {building} and everything stored inside it. This cannot be undone.", 3: "{building} goes bye-bye forever, contents and all. No takebacks." }, yue: { 1: "呢個動作會永久移除 {building} 同入面所有嘢，唔可以復原。", 3: "{building} 同入面啲嘢會永遠消失，冇得返轉頭。" } },

  // Zoo
  "panel.zoo.title": { en: { 1: "Zoo", 3: "Zoo" }, yue: { 1: "動物園", 3: "動物園" } },
  "panel.zoo.gridLabel": { en: { 1: "Enclosures" }, yue: { 1: "圍欄" } },
  "panel.zoo.emptyEnclosure": { en: { 1: "Empty enclosure — assign an animal", 3: "Empty pen, needs a resident" }, yue: { 1: "空圍欄－揀隻動物", 3: "空晒，揀隻嚟住先" } },

  // Mine
  "panel.mine.title": { en: { 1: "Mine", 3: "Mine" }, yue: { 1: "礦場", 3: "礦場" } },
  "panel.mine.gridLabel": { en: { 1: "Dig grid" }, yue: { 1: "挖礦格" } },
  "panel.mine.energyCost": { en: { 1: "{cost} energy per dig" }, yue: { 1: "每次挖耗 {cost} 體力" } },
  "panel.mine.currentTool": { en: { 1: "Current tool: {tool}" }, yue: { 1: "現用工具：{tool}" } },
  "panel.mine.tile": { en: { 1: "Tile, {state}" }, yue: { 1: "格仔，{state}" } },

  // Museum
  "panel.museum.title": { en: { 1: "Museum", 3: "Museum" }, yue: { 1: "博物館", 3: "博物館" } },
  "panel.museum.completed": { en: { 1: "Complete", 3: "Done and dusted" }, yue: { 1: "已完成", 3: "搞掂晒" } },
  "panel.museum.emptySlot": { en: { 1: "Missing" }, yue: { 1: "欠奉" } },
  "panel.museum.reward": { en: { 1: "Completion reward: {coins} coins" }, yue: { 1: "完成獎勵：{coins} 金幣" } },

  // Achievements
  "panel.achievements.title": { en: { 1: "Achievements", 3: "Achievements" }, yue: { 1: "成就", 3: "成就" } },
  "panel.achievements.progress": { en: { 1: "{progress} of {goal}" }, yue: { 1: "{progress} / {goal}" } },
  "panel.achievements.maxed": { en: { 1: "All tiers complete!", 3: "Maxed out — legend." }, yue: { 1: "全部階段完成！", 3: "封頂喇，勁！" } },
  "panel.achievements.claim": { en: { 1: "Claim reward", 3: "Grab it" }, yue: { 1: "領取獎勵", 3: "攞返啦" } },
  "panel.achievements.notReady": { en: { 1: "This tier isn't complete yet." }, yue: { 1: "呢個階段仲未完成。" } },

  // Dailies
  "panel.dailies.title": { en: { 1: "Daily tasks", 3: "Today's to-do list" }, yue: { 1: "每日任務", 3: "今日要做嘅嘢" } },
  "panel.dailies.claim": { en: { 1: "Claim", 3: "Take it" }, yue: { 1: "領取", 3: "攞咗佢" } },
  "panel.dailies.claimed": { en: { 1: "Claimed" }, yue: { 1: "已領取" } },
  "panel.dailies.alreadyClaimed": { en: { 1: "Already claimed today." }, yue: { 1: "今日已經攞過。" } },
  "panel.dailies.inProgress": { en: { 1: "In progress", 3: "Getting there…" }, yue: { 1: "進行中", 3: "做緊…" } },
  "panel.dailies.streak": { en: { 1: "{days}-day streak", 3: "{days} days in a row — keep it up!" }, yue: { 1: "連續 {days} 日", 3: "連續 {days} 日喇，加油！" } },
  "panel.dailies.claimStreak": { en: { 1: "Claim streak reward" }, yue: { 1: "領取連續獎勵" } },
  "panel.dailies.streakAlreadyClaimed": { en: { 1: "Already claimed today's streak reward." }, yue: { 1: "今日連續獎勵已經攞咗。" } },

  // Village (local-only — this notice must stay unmissable)
  "panel.village.title": { en: { 1: "Village", 3: "Village" }, yue: { 1: "村莊", 3: "村莊" } },
  "panel.village.localOnlyNotice": {
    en: {
      1: "This village is entirely local to this device. Nobody else is playing, and nothing here leaves your machine.",
      3: "Heads up: this whole village is make-believe on your own computer. No real neighbours, no internet, no data ever leaving this machine.",
    },
    yue: {
      1: "呢個村莊完全喺你部機入面運作，冇任何第三方玩緊，亦都唔會有任何資料傳出去。",
      3: "講明先：成條村都係你部機自己諗出嚟嘅，冇真人鄰居、唔連網、乜資料都唔會走出過呢部機。",
    },
  },
  "panel.village.level": { en: { 1: "Level {level}" }, yue: { 1: "等級 {level}" } },

  // Offline summary
  "panel.offlineSummary.title": { en: { 1: "Welcome back!", 3: "Welcome back!" }, yue: { 1: "歡迎返嚟！", 3: "返嚟喇！" } },
  "panel.offlineSummary.away": { en: { 1: "You were away for {duration}." }, yue: { 1: "你離開咗 {duration}。" } },
  "panel.offlineSummary.cropsHarvested": { en: { 1: "{count} crops harvested automatically" }, yue: { 1: "自動收成咗 {count} 樣作物" } },
  "panel.offlineSummary.coinsEarned": { en: { 1: "{count} coins earned" }, yue: { 1: "賺咗 {count} 個金幣" } },
  "panel.offlineSummary.xpEarned": { en: { 1: "{count} XP earned" }, yue: { 1: "賺咗 {count} 經驗值" } },
  "panel.offlineSummary.goodProduced": { en: { 1: "{good} x{amount} produced" }, yue: { 1: "生產咗 {good} x{amount}" } },
  "panel.offlineSummary.ordersExpired": { en: { 1: "{count} orders expired while you were away", 3: "{count} orders gave up waiting for you" }, yue: { 1: "有 {count} 張訂單喺你離開時過咗期", 3: "{count} 張訂單等到頸都長，過咗期" } },
  "panel.offlineSummary.vehiclesArrived": { en: { 1: "{count} deliveries arrived" }, yue: { 1: "有 {count} 批貨運到達" } },
});
