import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { setSsaoQuality } from '../engine/SsaoPass.js';
import { DEFAULT_SSAO_QUALITY } from '../engine/ssaoSettings.js';
import { createDofPass } from '../engine/DofPass.js';
import { ColorGrade } from '../effects/ColorGrade.js';
import { PlayerController } from '../player/PlayerController.js';
import { WorldManager } from '../world/WorldManager.js';
import { TimeController } from '../engine/Time.js';
import { DEFAULT_SHADOW_QUALITY, applySunShadowQuality } from '../engine/shadowPolicy.js';
import { DEFAULT_MSAA_SAMPLES, applyMsaaSamples } from '../engine/aaPolicy.js';
import { shake } from '../engine/Shake.js';
import { ZoneFog } from '../effects/ZoneFog.js';
import { scheduler } from '../engine/Scheduler.js';
import { PerfHUD } from '../engine/PerfHUD.js';
import { registerPerfGauges } from '../game/perfGauges.js';
import { createErrorReporter } from '../engine/errorReporter.js';
import { adoptSubsystem, runTeardowns } from '../engine/teardown.js';
import { HUD } from '../ui/HUD.js';
import { Dialog } from '../ui/Dialog.js';
import { HelpManual } from '../ui/HelpManual.js';
import { Tutorial } from '../ui/Tutorial.js';
import { UpgradePanel } from '../ui/UpgradePanel.js';
import { EnemyManager } from '../combat/EnemyManager.js';
import { CombatController } from '../combat/CombatController.js';
import { DamageNumbers } from '../combat/DamageNumbers.js';
import { ProjectileManager } from '../combat/ProjectileManager.js';
import { QuestSystem } from '../game/QuestSystem.js';
import { PlayerStats } from '../game/PlayerStats.js';
import { SaveSystem } from '../game/SaveSystem.js';
import { LootSystem } from '../game/LootSystem.js';
import { RestPointManager } from '../world/RestPointManager.js';
import { CollectibleManager } from '../world/CollectibleManager.js';
import { WorldEffects } from '../world/WorldEffects.js';
import { NPCManager } from '../world/NPCManager.js';
import { AudioManager } from '../audio/AudioManager.js';
import { DungeonManager } from '../world/DungeonManager.js';
import { SpellSystem } from '../combat/SpellSystem.js';
import { CinematicManager } from '../cinematic/CinematicManager.js';
import { SettingsManager } from '../core/SettingsManager.js';
import { PerformanceManager } from '../core/PerformanceManager.js';
import { WeaponSystem } from '../combat/WeaponSystem.js';
import { AchievementSystem } from '../game/AchievementSystem.js';
import { FastTravelSystem } from '../game/FastTravelSystem.js';
import { SettingsPanel } from '../ui/SettingsPanel.js';
import { PauseMenu } from '../ui/PauseMenu.js';
import { FastTravelPanel } from '../ui/FastTravelPanel.js';
import { WeaponSkillTree } from '../game/WeaponSkillTree.js';
import { RealmBleed } from '../effects/RealmBleed.js';
import { VoidEcho } from '../effects/VoidEcho.js';
import { ChaosLightning } from '../effects/ChaosLightning.js';
import { SoulWispManager } from '../world/SoulWispManager.js';
import { QuestAssistant } from '../ui/QuestAssistant.js';
import { WorldDecorations } from '../world/WorldDecorations.js';
import { BossBeacons } from '../world/BossBeacons.js';
import { PlayerAutoPlay } from '../player/PlayerAutoPlay.js';
import { GameGuidePanel } from '../ui/GameGuidePanel.js';
import { CombatFeedback } from '../effects/CombatFeedback.js';
import { StoryJournal } from '../game/StoryJournal.js';
import { StoryDirector } from '../game/StoryDirector.js';
import { ContextualTutorial } from '../ui/ContextualTutorial.js';
import { BossPhaseDirector } from '../ui/BossPhaseDirector.js';
import { WorldMapPanel } from '../ui/WorldMapPanel.js';
import { MapMarkerManager } from '../game/MapMarkerManager.js';
import { RestDialogue } from '../game/RestDialogue.js';
import { AmbientScenePass } from '../effects/AmbientScenePass.js';
import { SceneEnhancer } from '../effects/SceneEnhancer.js';
import { CombatCameraDirector } from '../cinematic/CombatCameraDirector.js';
import { RestSceneDirector } from '../cinematic/RestSceneDirector.js';
import { RestNpcManager } from '../world/RestNpcManager.js';
import { WeatherSystem } from '../world/WeatherSystem.js';
import { ExecutionEffects } from '../effects/ExecutionEffects.js';
import { RestCampfireAmbient } from '../world/RestCampfireAmbient.js';
import { RestPointEnhancer } from '../world/RestPointEnhancer.js';
import { DialogCGRenderer } from '../ui/DialogCGRenderer.js';
import { CombatTutorialDirector, CombatInputLock } from '../game/CombatTutorialDirector.js';
import { WorldAmbientEvents } from '../game/WorldAmbientEvents.js';
import { ExplorationMap } from '../game/ExplorationMap.js';
import { attachCombatCameraSkip } from '../cinematic/CombatCameraDirectorExtensions.js';
import { CombatCinematicSkip } from '../cinematic/CombatCinematicSkip.js';
import { RestNpcAnimDirector } from '../world/RestNpcAnimDirector.js';
import { CgGallerySystem } from '../game/CgGallerySystem.js';
import { CgJournalTab } from '../ui/CgJournalTab.js';
import { CgGalleryAchievements } from '../game/CgGalleryAchievements.js';
import { ExecutionSkipBurst } from '../effects/ExecutionSkipBurst.js';
import { CampfireMemorySystem } from '../game/CampfireMemorySystem.js';
import { CampfireMemoryJournalTab } from '../ui/CampfireMemoryJournalTab.js';
import { AchievementsJournalTab } from '../ui/AchievementsJournalTab.js';
import { LoreCodexSystem } from '../game/LoreCodexSystem.js';
import { LoreCodexJournalTab } from '../ui/LoreCodexJournalTab.js';
import { CombatStyleTracker } from '../game/CombatStyleTracker.js';
import { CombatStyleOverlay } from '../ui/CombatStyleOverlay.js';
import { BossRematchDirector } from '../world/BossRematchDirector.js';
import { ZoneTransitionFX } from '../effects/ZoneTransitionFX.js';
import { PhotoModeDirector } from '../cinematic/PhotoModeDirector.js';
import { attachCgGalleryExtras } from '../game/CgGallerySystemExtras.js';
import { attachAchievementExtras } from '../game/AchievementSystemExtras.js';
import { DungeonRunTracker } from '../game/DungeonRunTracker.js';
import { DungeonJournalTab } from '../ui/DungeonJournalTab.js';
import { WeaponSkillJournalTab } from '../ui/WeaponSkillJournalTab.js';
import { DeathHintDirector } from '../game/DeathHintDirector.js';
import { BossApproachDirector } from '../world/BossApproachDirector.js';
import { SoulStreakSystem } from '../game/SoulStreakSystem.js';
import { EndCreditsDirector } from '../cinematic/EndCreditsDirector.js';
import { SideQuestSystem } from '../game/SideQuestSystem.js';
import { SideQuestJournalTab } from '../ui/SideQuestJournalTab.js';
import { CombatSessionStats } from '../ui/CombatSessionStats.js';
import { RestNpcIdleDirector } from '../world/RestNpcIdleDirector.js';
import { PopCultureEchoSystem } from '../game/PopCultureEchoSystem.js';
import { PopCultureJournalTab } from '../ui/PopCultureJournalTab.js';
import { UpsideDownVisualPass } from '../effects/UpsideDownVisualPass.js';
import { PopCultureTriadVisualPass } from '../effects/PopCultureTriadVisualPass.js';
import { PopCultureWave4VisualPass } from '../effects/PopCultureWave4VisualPass.js';
import { attachPopCultureZones } from '../world/PopCultureZoneEnhancer.js';
import { attachPopCultureCombatBarks } from '../game/PopCultureCombatBarks.js';
import { ZONE_IDS } from '../content/ZoneIdentity.js';
import { GamepadInput } from '../engine/GamepadInput.js';
import { Rumble } from '../engine/Rumble.js';
import { UI_HOTKEYS, setHotkeyTable } from '../content/hotkeys.js';
import { gearLabel, pickupChoice } from '../content/gear.js';
import {
  GAMEPAD_BINDINGS, UI_GAMEPAD_BINDINGS, bindingFor, buildBindingTables, factoryKeybindings,
  factoryGamepadBindings, padOutletsFor, setKeybindTable,
} from '../content/keybinds.js';
import { setHintPadOutlets } from '../content/keyHints.js';
import { HotkeyRouter, escapeRoute, hotkeyBlockedBy } from '../ui/HotkeyRouter.js';
import { InputDevice } from '../engine/InputDevice.js';
import { topNavLayer } from '../ui/OverlayStack.js';
import { moveFocusWithin, activateFocused, adjustFocused } from '../ui/FocusNav.js';
export class Game {
  constructor(container) {
    this.clock = new THREE.Clock();
    /** 主循环唯一时间来源：dt 上限、timeScale（hitstop/慢动作）、固定步长累加器 */
    this.time = new TimeController();
    this.keys = {};
    /** 最近一次被按动的是哪一侧输入（切片29）：判断只在 `InputDevice` 里，谁都不另记一份 */
    this.inputDevice = new InputDevice();
    // 提示文案跟着"这一手是哪套输入"改口（切片33）。设备这本账仍只有 `InputDevice` 一处，
    // 换手的通知也仍然只有 `HUD.updateInputDevice()` 那一处（它每帧比对指示器那一格，
    // 变了就在重算键名之前把这一侧写进出口）—— 这里既不订阅也不另记，只把"手柄表怎么问"交出去。
    this.pointerLocked = false;
    this.timeOfDay = 0.35;
    this.container = container;
    this.paused = false;
    /** 手柄此刻归界面还是归战斗（切片14）；只在帧首比对一次，换表才走 `applyPadBindings` */
    this._padUi = false;
    this.cinematicActive = false;
    this.spectatorMode = false;
    this.autoPlayMode = false;

    this.scene = new THREE.Scene();
    // 初值 = 枢纽的大气行（content/zoneAtmosphere.js 的 HUB_ATMOSPHERE）——
    // 开局即在目标上，没有开局过渡。此后 fog 的写权限归 ZoneFog（每帧驱动，
    // 唯一写入者）；改前这行是全局唯一雾值，三个系统各写各的互相覆盖。
    this.scene.fog = new THREE.FogExp2(0x7a92aa, 0.0038);
    this.zoneFog = new ZoneFog(this.scene.fog);

    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 2500);

    // 没有 `antialias`：canvas 的 MSAA 帧缓冲只对"直接画到 canvas 的几何边"有效，
    // 而下面每一帧都走 EffectComposer（场景先进 composer 的 render target，最后由
    // 全屏三角上屏）—— 全屏三角没有几何边，这个构造参数自上线起就是死的。
    // 抗锯齿的真身在 composer target 的 samples 上，由 engine/aaPolicy.js 单独管。
    this.renderer = new THREE.WebGLRenderer({ powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.28;
    container.appendChild(this.renderer.domElement);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.28, 0.45, 0.92
    );
    this.composer.addPass(this.bloomPass);
    // 链尾显示变换（W-C4 切片3）：OutputPass 是 tone mapping + sRGB 编码的唯一执行点，
    // 它按 renderer 现状（toneMapping/exposure/outputColorSpace）实时重建 shader。
    // 没有它时 EffectComposer 把 bloom 判成链尾：场景主体经 bloom 的 MeshBasicMaterial blit
    // 上屏（带 tone mapping + sRGB），但 bloom 光晕的 additive 叠加走 CopyShader（裸输出），
    // 是把线性 bloom 值加到已 sRGB 编码的像素上 —— 光晕比线性空间合成弱，且发生在 ACES
    // 曲线之外。链尾归 OutputPass 后 bloom 改画回线性 readBuffer，场景 + bloom 先线性合成
    // 再一次 ACES + sRGB。铁律：**后续一切 pass（LUT/SSAO/景深）必须插在本行之前、
    // OutputPass 之前** —— 显示变换之后是 sRGB 空间，只有 OutputPass 允许站链尾。
    // 区域色彩分级（W-C4 切片4）：线性空间的 pass，**必须站 OutputPass 之前**（上面的铁律）。
    // 参数唯一真源是 content/zoneGrade.js 的冻结表，uniforms 写权限归 ColorGrade 控制器；
    // 出厂全中性（三个算式的恒等值），分级数值留给后续美术调参切片。
    this.colorGrade = new ColorGrade();
    this.composer.addPass(this.colorGrade.pass);
    // SSAO（W-C4 切片5）：屏幕空间环境光遮蔽，增强接触阴影与深度感。出厂 off
    //（B98：GTAO 每帧多一趟全场景法线渲染（_renderGBuffer），draw call 近翻倍 ——
    // B94 的 <400 验收线按出厂配置记的账，出厂就超线的档不配叫出厂）。
    // 挂/摘/换档收口在 setSsaoQuality 一个出口；插链位置 RenderPass 之后、bloom
    // 之前（AO 调制漫反射亮度，bloom 应基于 AO 后亮度），铁律"OutputPass 之前"自然满足。
    setSsaoQuality(this, DEFAULT_SSAO_QUALITY);    // 景深（W-C4 切片6）：电影级对焦效果，用于处决镜头和对话场景。
    // 铁律：DoF pass 必须插在 OutputPass 之前（线性空间运行），默认禁用，由外部系统动态启用。
    this.dofPass = createDofPass(this.scene, this.camera, {
      focus: 10,
      aperture: 0.025,
      maxblur: 1.0,
    });
    if (this.dofPass) {
      this.composer.addPass(this.dofPass);
    }
    this.composer.addPass(new OutputPass());
    // 全屏 MSAA（W-C4 切片1）：composer 自建的 target 默认 samples=0 —— 切到 composer
    // 链那天起全屏就没有过抗锯齿（上面 `antialias: true` 为死参数的另一半原因）。
    // 开机落出厂档，玩家档由 SettingsManager.applyToGame 走同一个出口。
    applyMsaaSamples(this.composer, DEFAULT_MSAA_SAMPLES);
    // renderer.info 每趟 render() 结束就重置 —— composer 的最后一趟（全屏输出单三角）
    // 会把 calls 覆盖成 1：PerfHUD 的 draw call 行从上线起就恒为 1（W-C3 切片4 真页面
    // 读数实锤）。关掉 autoReset，改成每帧 render() 开头手动清零，info 累计整帧所有趟
    // （场景趟 + bloom 各趟 + 输出趟）—— 那才是"这一帧画了多少"的账。
    this.renderer.info.autoReset = false;

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
    this.labelRenderer.domElement.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2';
    container.appendChild(this.labelRenderer.domElement);

    this.audio = new AudioManager();
    this.stats = new PlayerStats();
    this.dialog = new Dialog();
    this.dialogCg = new DialogCGRenderer();
    this.dialog.setCgRenderer(this.dialogCg);
    this.world = new WorldManager(this.scene, this.dialog);
    this.world.build();
    attachPopCultureZones(this);
    this.worldDecorations = new WorldDecorations(this.scene, this.world);
    this.worldDecorations.build();
    this.bossBeacons = new BossBeacons(this.scene, this.world);
    this.bossBeacons.build();

    this.worldEffects = new WorldEffects(this.scene);
    this.restPoints = new RestPointManager(this.scene, this.world);
    this.restPoints.buildDefaults();
    this.restNpcs = new RestNpcManager(this.scene, this.world, this.restPoints, this);
    this.restCampfireAmbient = new RestCampfireAmbient(this.restPoints);
    this.restPointEnhancer = new RestPointEnhancer(this.restPoints, this);
    this.weather = new WeatherSystem(this.scene, this.world, this.zoneFog);
    this.executionFx = new ExecutionEffects(this.scene, this);
    this.collectibles = new CollectibleManager(this.scene, this.world, this.stats, this.dialog);
    this.quests = new QuestSystem(this.dialog);
    this.storyJournal = new StoryJournal(this);
    this.storyDirector = new StoryDirector(this);
    this.npcs = new NPCManager(this.scene, this.world, this.dialog, this);
    this.soulWisps = new SoulWispManager(this.scene, this.world, this.stats, this.dialog, this.audio);
    this.voidEcho = new VoidEcho(this.scene);
    this.chaosLightning = new ChaosLightning(this.scene, this.camera);
    this.realmBleed = new RealmBleed();

    this.damageNumbers = this._adopt('combat/DamageNumbers', new DamageNumbers(this.scene));
    /** 震屏：全局唯一实例，各战斗/法术系统直接 `addShake()` 请求，主循环只在这里推进 */
    this.shake = shake;
    this.combatFeedback = this._adopt('effects/CombatFeedback', new CombatFeedback(this.scene));
    this.projectiles = new ProjectileManager(this.scene, this.audio);
    this.loot = new LootSystem(this.scene, this.stats, this.audio, {
      onGear: (instance) => this.pickUpGear(instance),   // 捡到装备之后怎么办，只有这一处说了算
    });
    this.enemyManager = new EnemyManager(this.scene, this.world, this.projectiles);
    this.enemyManager.spawnDefaults();

    this.player = new PlayerController(this.scene, this.camera, this.world, this);
    this.player.combat = new CombatController(
      this.player, this.enemyManager, this.dialog, this.damageNumbers, this.audio, this.stats
    );
    this.player.combat.feedback = this.combatFeedback;
    this.player.combat.setTimeController(this.time);

    this.dungeons = new DungeonManager(this.scene, this.world, this.dialog, this.enemyManager, this);
    this.world.setDungeonManager(this.dungeons);
    this.spells = new SpellSystem(
      this.scene, this.player, this.enemyManager, this.projectiles, this.damageNumbers, this.audio, this.stats
    );
    // 法术命中与近战共用同一批特效池（同一个 CombatFeedback 实例）
    this.spells.feedback = this.combatFeedback;
    // 属性读数的消费者在这里登记一次：升级与穿戴之后"把新数推下去"只有 `PlayerStats` 那一处
    this.stats.bindConsumers({ combat: this.player.combat, spells: this.spells });

    this.hud = this._adopt('ui/HUD', new HUD(this));
    this.upgrade = new UpgradePanel(this);
    this.helpManual = new HelpManual(this);
    this.tutorial = new Tutorial(this.dialog, this.helpManual, this);
    this.cinematics = new CinematicManager(this);
    this.combatCamera = new CombatCameraDirector(this);
    attachCombatCameraSkip(this.combatCamera, this);
    this.combatCinematicSkip = this._adopt('cinematic/CombatCinematicSkip', new CombatCinematicSkip(this));
    this.executionSkipFx = new ExecutionSkipBurst();
    this.combatInputLock = new CombatInputLock(this);
    this.combatTutorial = new CombatTutorialDirector(this);
    this.restScene = new RestSceneDirector(this);
    this.worldAmbient = new WorldAmbientEvents(this);
    this.cgGallery = new CgGallerySystem(this);
    this.cgJournalTab = new CgJournalTab(this);
    this.cgGalleryAchievements = new CgGalleryAchievements(this);
    this.restNpcAnimDirector = new RestNpcAnimDirector(this);

    this.campfireMemory = new CampfireMemorySystem(this);
    this.campfireMemoryTab = new CampfireMemoryJournalTab(this);
    this.achievementsJournalTab = new AchievementsJournalTab(this);
    this.loreCodex = new LoreCodexSystem(this);
    this.loreCodexTab = new LoreCodexJournalTab(this);
    this.combatStyle = new CombatStyleTracker(this);
    this.combatStyleOverlay = new CombatStyleOverlay(this);
    this.bossRematch = new BossRematchDirector(this);
    this.zoneTransitionFx = new ZoneTransitionFX(this);
    this.photoMode = new PhotoModeDirector(this);

    this.dungeonRuns = new DungeonRunTracker(this);
    this.dungeonJournalTab = new DungeonJournalTab(this);
    this.weaponSkillJournalTab = new WeaponSkillJournalTab(this);
    this.deathHints = new DeathHintDirector(this);
    this.bossApproach = new BossApproachDirector(this);
    this.soulStreak = new SoulStreakSystem(this);
    this.endCredits = new EndCreditsDirector(this);
    this.sideQuests = new SideQuestSystem(this);
    this.sideQuestJournalTab = new SideQuestJournalTab(this);
    this.sessionStats = new CombatSessionStats(this);
    this.restNpcIdle = new RestNpcIdleDirector(this);
    this.popCulture = new PopCultureEchoSystem(this);
    this.popCultureTab = new PopCultureJournalTab(this);
    this.upsideDownFx = new UpsideDownVisualPass(this);
    this.triadVisualFx = new PopCultureTriadVisualPass(this);
    this.wave4VisualFx = new PopCultureWave4VisualPass(this);

    this.settings = new SettingsManager();
    this.performance = new PerformanceManager();
    this.weapons = new WeaponSystem(this.player, this.dialog, this.audio);
    this.achievements = new AchievementSystem(this.dialog);
    this.fastTravel = new FastTravelSystem(this);
    this.settingsPanel = new SettingsPanel(this);
    this.pauseMenu = new PauseMenu(this);
    this.fastTravelPanel = new FastTravelPanel(this);
    this.weaponSkills = new WeaponSkillTree(this.stats, this.dialog, this);
    this.explorationMap = new ExplorationMap(this);
    this.mapMarkers = new MapMarkerManager(this);
    this.restDialogue = new RestDialogue(this);
    this.bossPhaseDirector = new BossPhaseDirector(this);
    this.worldMapPanel = new WorldMapPanel(this);
    this.questAssistant = new QuestAssistant(this);
    this.playerAutoPlay = new PlayerAutoPlay(this);
    this.gameGuide = new GameGuidePanel(this);
    this.contextualTutorial = new ContextualTutorial(this);
    this.storyJournal.setupListeners();
    this.explorationMap.setupListeners();
    this.explorationMap.revealZone('hub');
    this.weaponSkills.tryNarrativeUnlocks(this);
    this.settings.applyToGame(this);

    // F3：GPU 对象与场景规模只增不减 = 泄漏；数值全部经公开接口取，不翻系统内部字段。
    // 清单搬进 `game/perfGauges.js`（W-C1 切片4）—— 修前这六行都没带 `leak: true`，
    // 于是 `stats().leaks` 恒空、watchdog 从没可能报过警；搬出来之后用例能拿假 game 跑
    // `registerPerfGauges` 并断言"注册完 leaks 不是空的"，那正是修前会红的那一条。
    this.perfHud = this._adopt('engine/PerfHUD', registerPerfGauges(new PerfHUD({ renderer: this.renderer, scene: this.scene }), this));

    // W-D5 切片2：把未捕获异常与未处理的 Promise 拒绝收进一个可读账本。
    // 尽早装（在 setupLights / setupInput 之前）—— 启动期的错最值得留现场。
    // **它不吞异常**：处理器不返回 true、也不调 preventDefault，控制台照常打印。
    this.errorReporter = createErrorReporter();
    this.errorReporter.install();

    this.setupLights();
    this.ambientPass = new AmbientScenePass(this);
    this.setupInput();
    this.setupEvents();
    SaveSystem.load(this);
    this.restNpcAnimDirector.attachRestNpcs(this.restNpcs.npcs);
    this.restNpcIdle.attachRestNpcs(this.restNpcs.npcs);
    attachCgGalleryExtras(this.cgGallery);
    attachAchievementExtras(this.achievements);
    attachPopCultureCombatBarks(this);
    this.bossRematch.syncFromQuests?.();
    this.cgGallery.unlock('bonus:world-anchor', 'init');
    this.quests.stats.skillsUnlocked = this.weaponSkills.unlocked.size;
    this.quests.syncProgress();
    this.quests.checkProgress();
    if ((this.quests.chapter ?? 1) >= 5) this.dungeons.rerunUnlocked = true;
    this.gameGuide?.refresh();
    window.dispatchEvent(new CustomEvent('skill-points-changed', { detail: { points: this.weaponSkills.skillPoints } }));
    window.dispatchEvent(new CustomEvent('stats-changed', { detail: this.stats.toJSON() }));

    window.addEventListener('resize', () => this.onResize());
  }

  /**
   * 收编一个子系统：构造完立刻把它的 `dispose` 交给登记表（W-A1 注销欠账迁移第二处）。
   *
   * **没有 `dispose()` 的子系统会被当场拒绝** —— 那正是"假装收编"的防线：
   * 一句 `registerTeardown(tag, () => {})` 也能让账面上多一条，但拆卸时什么都不会发生。
   * 要收编就得先有清理路径。
   */
  _adopt(tag, instance) {
    return adoptSubsystem(tag, instance);
  }

  /**
   * 把整个游戏收干净：按登记的反序执行各子系统的 `dispose()`，再摘掉全局错误收集器。
   *
   * `new Game()` 全仓只出现一次（`main.js` 的 `boot()`），所以这条路径今天主要由
   * 测试与将来的"重开一局"使用 —— 但它是那笔 129 处裸监听欠账的**总出口**：
   * 有了它，"注销路径存在"才会变成"注销会发生"。
   */
  dispose() {
    const closed = runTeardowns();
    this.errorReporter?.uninstall?.();
    return closed;
  }

  setupEvents() {
    window.addEventListener('chapter-changed', () => {
      this.weaponSkills.tryNarrativeUnlocks(this);
    });
    window.addEventListener('game-completed', () => {
      this.dialog.show('无尽行者', 'Chapter 5 完成。你斩裂混沌，成为真正的位面行者。\n\n五区贯通、六位 Boss 倒下，这段旅程到此为止——愿下次重逢时，这个世界更加辽阔。');
      SaveSystem.save(this);
    });
    window.addEventListener('spell-toast', (e) => this.dialog.toast(e.detail.message));
    window.addEventListener('zone-changed', (e) => {
      // 区域 id 由世界层给出（修 B36：这里以前是一串 `name.includes('米勒')` 式的中文匹配）
      const zone = e.detail.zoneId;
      this.worldEffects.setZone(zone, this.player.position);
      this.weather.setZone(zone);
      this.worldAmbient?.setZone(zone);
      this.audio.setZone(zone);
      // 换区的瞬间在旧位置留下的火花不该跨场景继续烧（池本身定容，这里只收干净画面）
      this.combatFeedback.reset();
    });
    window.addEventListener('quest-updated', (e) => {
      if ((e.detail.chapter ?? 1) >= 2) this.fastTravel.unlock();
    });
    window.addEventListener('enemy-defeated', (e) => {
      if (e.detail.type === 'boss') this.weaponSkills.addPoint(2);
    });
    window.addEventListener('boss-start', (e) => {
      this.audio.startBossFight(e.detail.bossId);
    });
    window.addEventListener('boss-defeated', () => {
      this.audio.endBossFight();
      // 击败 Boss 后立即重扫叙事技（W-B8 切片5）：`enemy-defeated` 先于本事件触发，
      // 已把对应 Boss 的统计写进任务账本（`BOSS_STAT_KEYS` -> `quests.stats`），
      // 所以此刻 `tryNarrativeUnlocks` 能立刻白送那条「条件=击败此 Boss」的叙事技，
      // 不必等章节推进或下次读档。
      this.weaponSkills.tryNarrativeUnlocks(this);
    });
    window.addEventListener('boss-phase', (e) => {
      this.audio.setBossPhase(e.detail.phase ?? 2);
    });
    window.addEventListener('game-audio-mode', (e) => {
      const mode = e.detail.mode;
      if (mode === 'zone') this.audio.setMode('zone', this.world.zoneId);
      else this.audio.setMode(mode);
    });
    window.addEventListener('game-audio-sfx', (e) => {
      // 名字对不对由 AudioManager 自己判（B71）：这里不再做 `typeof === 'function'` 的静默兜底，
      // 抄错音效名的代价从"那一下没声音"变成当场抛错给开发者看。
      this.audio.playSfx(e.detail?.sfx);
    });
    window.addEventListener('dungeon-supply', (e) => {
      this.player.combat.restore(e.detail);
    });
    window.addEventListener('textures-ready', () => {
      new SceneEnhancer(this).apply();
      this.worldDecorations?.applyTreeTextures?.();
    });
  }

  setupLights() {
    this.sky = new Sky();
    this.sky.scale.setScalar(450000);
    this.scene.add(this.sky);
    this.skyUniforms = this.sky.material.uniforms;
    this.skyUniforms.turbidity.value = 6;
    this.skyUniforms.rayleigh.value = 2.4;
    this.skyUniforms.mieCoefficient.value = 0.005;
    this.skyUniforms.mieDirectionalG.value = 0.78;

    this.ambient = new THREE.HemisphereLight(0xb8c8e0, 0x3a4530, 0.68);
    this.scene.add(this.ambient);

    this.fillLight = new THREE.DirectionalLight(0xaec8ff, 0.42);
    this.fillLight.position.set(-60, 40, -80);
    this.scene.add(this.fillLight);

    this.sun = new THREE.DirectionalLight(0xfff4e8, 1.85);
    this.sun.position.set(80, 120, 60);
    this.sun.castShadow = true;
    // 贴图精度与正交框半宽的唯一出处：mapSize 与 left/right/top/bottom 都随画质档走
    // （shadowPolicy），出厂档与硬编码时代同值 —— 这里不再手写 4096 / ±140
    applySunShadowQuality(this.sun, DEFAULT_SHADOW_QUALITY);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 450;
    this.scene.add(this.sun);
    // target 必须进场景图：不进的话它的 matrixWorld 恒为 identity，
    // 每帧把 target 挪到玩家脚下就是白挪（阴影框依旧焊在原点，见 shadowPolicy.applySunFollow）
    this.scene.add(this.sun.target);
  }

  /**
   * 镜头输入能不能进：自动演示与输入锁定期不让动镜头。
   *
   * `forPointer` 只对鼠标成立 —— 手柄没有"指针锁"这回事，用它要求指针锁就等于
   * "玩家必须先点一下画面才能转镜头"。两条路共用这一个判据，免得改守卫时只改了一半。
   */
  cameraInputAllowed(forPointer) {
    if (this.autoPlayMode) return false;
    if (this.combatInputLock?.blocksCamera?.()) return false;
    if (this.dialog.open || this.upgrade.open) return false;
    return forPointer ? this.pointerLocked : true;
  }

  /**
   * 模态现状的**唯一**生产者（切片10）。
   *
   * 字段名就是 `ui/OverlayStack.js` 里登记的 `state` 名 —— 阻塞判据与 Escape 级联吃的是
   * 同一份，所以"哪个面板开着"这件事只在这里问一次。有一条静态门禁逐字段比对两边。
   */
  overlayState() {
    return {
      worldMapOpen: !!this.worldMapPanel?.open,
      autoPlayActive: !!this.playerAutoPlay?.active,
      helpOpen: !!this.helpManual.open,
      cinematicActive: !!this.cinematicActive,
      settingsOpen: this.settingsPanel.open,
      fastTravelOpen: this.fastTravelPanel.open,
      pauseMenuOpen: this.pauseMenu.open,
      dialogOpen: this.dialog.open,
      upgradeOpen: this.upgrade.open,
      // 日志抽屉今天也算一层（切片27 / 修 B57）：以前它只归 HUD 自己记，级联与走焦都不知道它开着
      journalOpen: !!this.hud?.journalOpen,
    };
  }

  /**
   * UI 热键放不放行：判据本体在 `hotkeyBlockedBy`（纯函数，可测），这里只把模态现状喂进去。
   *
   * 切片10 起这条判据认识"返回键"：有返回层的模态开着时，其余热键照挡，但 Escape（改绑后
   * 是玩家那个新码）放行给级联决定关哪一层 —— 以前它连 Escape 一起挡，暂停菜单只能点"继续"（B46）。
   * 世界地图那条例外的键名归生效表说（切片7，B50）。
   */
  hotkeyBlocked(code) {
    return hotkeyBlockedBy(this.overlayState(), code);
  }

  /**
   * 生效中的输入表 = 出厂表 + 玩家重映射，**UI 热键、游戏键、战斗手柄、界面手柄四张表同一次重建**
   * （W-A7 切片5 / 切片9 / 切片23）。
   *
   * 存储里只有三格覆盖包（`keybinds` / `gamepadBinds` / `gamepadUiBinds`），玩家不必知道哪个动作归哪张表；
   * 叠表、分流与跨表撞键校验都在 `buildBindingTables` 一处做完。设置面板预览这次改动时
   * 调的是同一个函数 —— 面板放过而游戏拒绝，玩家就是点完才被告知失败。
   *
   * 存储里是玩家可控的数据，坏了不能连游戏一起起不来：校验不过就清掉覆盖、恢复出厂，
   * 并当场告诉玩家发生了什么。
   */
  rebuildHotkeys() {
    const overrides = this.settings.get('keybinds') ?? {};
    const padOverrides = this.settings.get('gamepadBinds') ?? {};
    const uiPadOverrides = this.settings.get('gamepadUiBinds') ?? {};
    let hotkeyTable;
    let keyTable;
    let padTable;
    let uiPadTable;
    try {
      ({ hotkeyTable, keyTable, padTable, uiPadTable } = buildBindingTables(
        overrides, UI_HOTKEYS, padOverrides, uiPadOverrides,
      ));
    } catch {
      hotkeyTable = UI_HOTKEYS.map((e) => ({ ...e }));
      keyTable = factoryKeybindings();
      padTable = factoryGamepadBindings();
      uiPadTable = factoryGamepadBindings(UI_GAMEPAD_BINDINGS);
      this.settings.data.keybinds = {};
      this.settings.data.gamepadBinds = {};
      this.settings.data.gamepadUiBinds = {};
      this.dialog?.toast('键位配置无效，已恢复默认键位');
    }
    this.hotkeyTable = hotkeyTable;
    this.keybindTable = keyTable;
    this.padTable = padTable;
    // 界面态那张表也在这里生效（切片23）：与战斗表同一批建、同一次回落，面板预览走的
    // 是同一个 `buildBindingTables`，所以"面板放过而游戏拒绝"在这两格上都不会出现
    this.uiPadTable = uiPadTable;
    this.hotkeys?.useTable(hotkeyTable);
    // 手柄桥换一张表（切片9）：按钮在按下那一刻才解析出口，所以换表不用重建桥、也不动借键账本
    this.applyPadBindings();
    // 提示文案（HUD / 交互条 / 教程）问的是模块级生效表，与消费者同一条路（切片6）
    setHotkeyTable(hotkeyTable);
    // 游戏键生效表是模块级的：消费者（玩家 / 战斗 / 法术 / 武器 / 旅行）直接问 `codeFor`
    setKeybindTable(keyTable);
    // 手柄出口也要活着（切片33）：提示文案得按"这一手是手柄"改说"右摇杆按下"，
    // 而"这一格绑在哪"随改绑走 —— 所以交出去的是取值函数而不是一份快照。
    setHintPadOutlets((action) => padOutletsFor(
      this.padTable ?? GAMEPAD_BINDINGS, this.uiPadTable ?? UI_GAMEPAD_BINDINGS, action,
    ));
    this.hud?.refreshKeyHints?.();
    // 说明书正文里也是 `{动作}` 占位（W-B2 切片4）：它开着的时候改绑，正文得跟着改口
    this.helpManual?.refreshKeyHints?.();
  }

  /**
   * 此刻手柄归谁（切片14）：层表说"有一个收焦点的面板开着"，那一批按钮就归界面。
   *
   * 判据只在这里算一次。以前想过给每格按钮加一列"面板里改成干什么"，那只是把同一个判断
   * 抄到十几格里 —— 而"面板开着"这件事的真源本来就是层表，两处各判一次就会有对不齐的一帧。
   */
  padUiMode() {
    return !!topNavLayer(this.overlayState());
  }

  /**
   * 换手柄表只走这一条路：改绑（`rebuildHotkeys`）与上下文切换（`update`）都到这里来。
   *
   * 两处各自 `useBindings` 就是第二个写点 —— 那会漏掉一条：改完绑还在面板里，
   * 于是游戏表被装回去、A 又从"确认"变回"跳跃"。
   *
   * 界面态装的是**生效**那张（`uiPadTable`，切片23），不是出厂常量：`?? UI_GAMEPAD_BINDINGS`
   * 只兜住"表还没建起来"的启动早期（`setupInput` 之前就有面板开过一次的路径）。
   */
  applyPadBindings() {
    this.padInput?.useBindings(this.padUiMode() ? (this.uiPadTable ?? UI_GAMEPAD_BINDINGS) : this.padTable);
  }

  /**
   * 手柄按下时该冒充哪个键（W-A7 切片5）。桥不认识热键表，所以由这里注入：
   * 声明了 `hotkey` 的格子去问当前生效的热键表（返回键改绑之后手柄的 Start 跟着走），
   * 其余问游戏键生效表。
   */
  /**
   * 捡到一件装备：严格更好就换上，其余进背包；换下的那件也进背包 —— 只有**包满**才折成魂。
   *
   * 判据与字样都不在这里现算 —— `pickupChoice` 与 `gearLabel` 在 `content/gear.js`，
   * 这里只负责"把它装到玩家身上并告诉玩家发生了什么"（W-A7 切片6/7 那条同一形状：
   * 显示、判定、真源各在一处）。
   *
   * 切片2 的处置是"换下的当场折魂"，那是在**没有包**时唯一说得出来的去处；切片4 的包在场，
   * 折魂就成了一个玩家没得选的损失。改成"都进包"之后，包满那一格是显式兜底 —— 满了要说得出理由，
   * 而不是东西凭空不见（`GEAR_BAG.capacity` 是表上的一格，不是这里写死的字面量）。
   */
  pickUpGear(instance) {
    const choice = pickupChoice(this.stats.gear, instance);
    if (choice.action === 'nothing') return null;
    if (choice.action === 'equip') {
      const replaced = this.stats.equip(choice.slot, instance);
      if (replaced && this.stats.bagAdd(replaced)) {
        this.dialog.toast(`换上：${gearLabel(instance)}（旧的 ${gearLabel(replaced)} 进了背包）`);
      } else if (replaced) {
        this.stats.addSouls(choice.souls);
        this.dialog.toast(`换上：${gearLabel(instance)}（背包已满，旧的 ${gearLabel(replaced)} 折成 ${choice.souls} 魂）`);
      } else {
        this.dialog.toast(`穿上：${gearLabel(instance)}`);
      }
      return choice;
    }
    if (this.stats.bagAdd(instance)) {
      this.dialog.toast(`拾取：${gearLabel(instance)} —— 放进背包（${this.stats.bagCount}/${this.stats.bagCapacity}）`);
      return choice;
    }
    this.stats.addSouls(choice.souls);
    this.dialog.toast(`拾取：${gearLabel(instance)} —— 背包已满，折成 ${choice.souls} 魂`);
    return choice;
  }

  resolvePadBinding(slot) {
    if (slot.hotkey) {
      const code = this.hotkeyTable?.find((e) => e.action === slot.hotkey)?.code;
      return code ? { code } : null;
    }
    return bindingFor(slot.action);
  }

  /** 一个动作一格：动作名来自 `content/hotkeys.js`，键盘与手柄派发的是同一个这里 */
  runHotkey(action) {
    switch (action) {
      case 'help': return this.helpManual.toggle();
      case 'minimap': return this.hud.toggleMinimap();
      case 'worldMap': return this.worldMapPanel?.toggle();
      case 'cameraMode': return this.player.toggleCameraMode();
      case 'zonePanel':
        // Tab 在地图上开著时是"换选中的标记"，在野外才是"翻区域面板"
        if (this.worldMapPanel?.open) {
          this.mapMarkers.cycleActive();
          return this.worldMapPanel.draw();
        }
        return this.hud.toggleZonePanel();
      case 'questTracker': return this.questAssistant.toggle();
      case 'autoPlay': return this.questAssistant.startAutoPlay();
      case 'journal': return this.hud.toggleJournal();
      case 'photoMode': return this.photoMode?.toggle();
      case 'perfHud': return this.perfHud?.toggle();
      case 'sessionStats': return this.sessionStats?.toggle();
      case 'save': return SaveSystem.save(this);
      case 'load': return SaveSystem.load(this);
      case 'settings': return this.settingsPanel.show();
      case 'escape': return this.runEscape();
      // 面板内移焦（切片11）：↑↓ 只在开着的面板里走路，野外按了什么都不做
      case 'uiUp': return this.movePanelFocus(-1);
      case 'uiDown': return this.movePanelFocus(1);
      // 面板内调值（切片16）：← → 推焦点那一格的数值。这里刻意**不问层表** ——
      // 该问的是"焦点在哪一格"，那是唯一事实；层表回答的是"走焦走进哪个面板"（`movePanelFocus`）。
      // 手柄走的也是这一句：十字键左右在桥里冒充 ← →，于是两条输入只有一个消费者。
      case 'uiLeft': return adjustFocused(-1);
      case 'uiRight': return adjustFocused(1);
      default: return false;
    }
  }

  /**
   * 移焦该落进哪个面板：`nav` 那一格说（切片11）。层表与 Escape 级联吃同一份现状，
   * 所以"这一下返回关掉的面板"与"↑↓ 走进来的面板"是同一个 —— 清单与算式在 `ui/FocusNav.js`。
   */
  movePanelFocus(delta) {
    const layer = topNavLayer(this.overlayState());
    if (!layer) return false;
    return moveFocusWithin(document.getElementById(layer.nav), delta);
  }

  /** Escape 那条级联的顺序就是产品决策，本体收在 `OVERLAY_LAYERS`（切片3 抽纯、切片10 成表） */
  runEscape() {
    switch (escapeRoute({
      ...this.overlayState(),
      // 这两位不在 `overlayState()` 里：`trySkip()` 带副作用（吃掉这一层），`canSkip()` 是纯问句
      endCreditsSkippable: !!this.endCredits?.trySkip?.(),
      combatCinematicSkippable: !!this.combatCinematicSkip?.canSkip?.(),
    })) {
      case 'endCredits': return true;                 // `trySkip()` 已经吃掉这一下
      case 'dialog': this.dialog.hide(); return true;  // 对话自己不再挂 keydown（B52）
      case 'combatCinematic': this.combatCinematicSkip?.skip?.(); return true;   // 同上：跳过只在这里发生
      case 'worldMap': return this.worldMapPanel.hide();
      case 'autoPlay': return this.playerAutoPlay.stop(false);
      case 'help': return this.helpManual.hide();
      case 'cinematic': return this.cinematics.skip();
      case 'settings': return this.settingsPanel.hide();
      case 'fastTravel': return this.fastTravelPanel.hide();
      // 升级面板（切片24）：以前这一层不吃返回键，纯手柄玩家在营火升级完就退不出去
      case 'upgrade': this.upgrade.hide(); return true;
      // 日志抽屉（切片27 / 修 B57）：走 `setJournal(false)` 而不是 `toggleJournal()` ——
      // 级联关它的时候再 toggle 一次就是"按一下变成再开一次"，那正是改前读数的"关不掉"
      case 'journal': this.hud.setJournal(false); return true;
      case 'pauseMenu': return this.pauseMenu.toggle();
      default: return false;
    }
  }

  setupInput() {
    const canvas = this.renderer.domElement;

    /** 手柄桥：没有手柄时 `poll()` 只做一次枚举，`keys` 与键盘路径逐字不变 */
    this.padInput = new GamepadInput(
      { keys: this.keys, mouseDown: this.player.combat.mouseDown },
      GAMEPAD_BINDINGS,
      null,
      // 出口在按下那一刻才解析（切片5）：改绑立刻生效，不必重建桥
      (slot) => this.resolvePadBinding(slot),
    );
    /* 震动（切片17）：挂在桥建好之后 —— 它是桥的第四类出口，请求方仍然只有 `addShake()` 那一处。
     * `Shake.add` 把同一条 `intensity` 顺路交给这里，所以"这一击多重"没有第二个真源；
     * 没插手柄（或那只没有致动器）时 `vibrate` 返回 false，`Rumble` 就安静地不下令。 */
    this.rumble = new Rumble((pulse) => this.padInput.vibrate(pulse));
    this.shake.setImpactSink((intensity) => this.rumble.request(intensity));
    // 桥是最后建起来的消费者，而玩家的**手感档**要落在它身上（切片15）——
    // 上面那次 `applyToGame`（构造早期）那时还没有桥。写手档的路径仍然只有一条：
    // `SettingsManager.applyToGame`，这里只是把同一件事在桥就位后再走一次
    this.settings.applyToGame(this);

    /**
     * UI 热键派发（W-A7 切片3）：从"keydown 分支"改成"表 + 边沿轮询"，
     * 于是键盘与手柄走同一条路（手柄的 Start 绑到 `Escape` 就能开暂停菜单）。
     */
    this.hotkeys = new HotkeyRouter({
      table: UI_HOTKEYS,
      isBlocked: (code) => this.hotkeyBlocked(code),
      onAction: (action) => this.runHotkey(action),
    });
    this.rebuildHotkeys();

    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      this.inputDevice.note('keyboard');   // 顺手记一侧：不新增监听器（那会有第二个"这一下算谁"）
      // 事件这一刻只做"要不要挡浏览器默认行为"；动作派发交给 `hotkeys.poll()`（见 `ui/HotkeyRouter.js`）
      if (this.hotkeys.onKeydown(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });

    canvas.addEventListener('click', (e) => {
      if (this.autoPlayMode || this.dialog.open || this.upgrade.open) return;
      if (this.combatInputLock?.blocksInput?.()) return;
      if (!this.pointerLocked) { canvas.requestPointerLock(); return; }
      if (e.button === 0) this.player.combat.mouseDown.left = true;
    });

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mousedown', (e) => {
      // 指示记在守卫之前：这一下玩家用的确实是鼠标，哪怕游戏因为没锁指针而不收它 ——
      // 放在守卫之后就变成"只有打出去的那一下才算"，玩家点第一下求锁定时指示器不动
      this.inputDevice.note('mouse');
      if (this.autoPlayMode || !this.pointerLocked || this.dialog.open || this.upgrade.open) return;
      if (this.combatInputLock?.blocksInput?.()) return;
      if (e.button === 0) this.player.combat.mouseDown.left = true;
      if (e.button === 2) this.player.combat.mouseDown.right = true;
    });

    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === canvas;
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.cameraInputAllowed(true)) return;
      this.player.addCameraInput(e.movementX, e.movementY);
    });

    document.getElementById('autoplay-fab')?.addEventListener('click', () => {
      this.questAssistant.startAutoPlay();
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.player.adjustZoom(e.deltaY * 0.01);
    }, { passive: false });
  }

  onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.player.rig.setAspect(w / h);
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloomPass.resolution.set(w, h);
    this.labelRenderer.setSize(w, h);
  }

  update() {
    this.time.tick(this.clock.getDelta(), performance.now() / 1000);
    const rawDt = this.time.rawDt;
    this.perfHud?.update(rawDt);
    /* 演出与 UI 节奏走 rawDt：不受命中停顿/慢动作影响（B39）。
     * 放在最前面，让"这一帧该弹的横幅"在本帧的渲染里就位，而不是拖到下一帧。 */
    scheduler.update(rawDt);
    // W-D1 切片1：模态栈开着时自动释放指针锁 —— 面板里的鼠标点击不再被游戏收走。
    // 判据吃同一份现状（`overlayState()`），所以"返回键关掉的层"与"释放指针锁的层"是同一个；
    // 不要求立刻重获锁定，等玩家点回 canvas 再要（`canvas.requestPointerLock()` 在 click 守卫里）。
    const overlay = this.overlayState();
    if (this.pointerLocked && topNavLayer(overlay)) {
      document.exitPointerLock();
    }
    this.combatCamera.update(rawDt);
    this.combatInputLock.update(rawDt);
    const dt = rawDt * this.time.timeScale * this.combatCamera.getTimeScale();
    // 手柄每帧轮询一次（B39 同一条纪律：输入状态是"这一帧的样子"，不是事件瞬间的样子）。
    // 它把按钮/摇杆合成进 `this.keys` 的同一形状，所以键盘路径与所有消费者不必认识手柄。
    // 表在帧首切（切片14）：这一帧的按下要用这一帧该归的那张表，晚一帧就是"按 B 先跳了一下"。
    const padUi = this.padUiMode();
    if (padUi !== this._padUi) {
      this._padUi = padUi;
      // 换表走的是切片9 那条结转：按动作名接边沿与借键账本，所以进界面那一刻
      // 战斗侧借走的键会被原样还掉 —— 不退菜单就永远朝前走，那一类事故就是这么挡住的
      this.applyPadBindings();
    }
    this.padInput?.poll();
    // 手柄只在**被按动**那一帧才算这一侧在用（桥在同一趟轮询里算好的 `touched`）
    if (this.padInput?.touched) this.inputDevice.note('gamepad');
    // 界面里 A 那一下：桥只报了个边沿（它不冒充键盘，否则就是第二个 Enter 消费者），
    // 激活仍然交回浏览器 —— 点的是"当前聚焦的那一格"
    if (this.padInput?.ui.confirm) activateFocused(document);
    // 右摇杆镜头走 `rawDt`：它与鼠标同属"玩家的物理输入"，命中停顿不该把手也冻住
    // （鼠标事件本来就不经时间倍率）。守卫与鼠标共用 `cameraInputAllowed`，只是不要求指针锁。
    const padLook = this.padInput?.look;
    if (padLook && (padLook.x !== 0 || padLook.y !== 0) && this.cameraInputAllowed(false)) {
      this.player.addCameraInput(padLook.x * rawDt, padLook.y * rawDt);
    }
    // UI 热键每帧派发一次：键盘与手柄共用同一个出口（暂停菜单从此不必"只有键盘能开"）。
    // `rawDt` 是给自动重复用的（切片18）：走焦/调值按住要连着走，而节奏按秒算不按帧算，
    // 且与右摇杆同一道理 —— 命中停顿冻住的是世界，不该冻住玩家的手。
    this.hotkeys.poll(this.keys, rawDt);
    this.combatStyle?.update(dt);
    this.combatStyleOverlay?.update(dt);
    this.zoneTransitionFx?.update(dt);
    this.soulStreak?.update(dt);
    this.sideQuests?.update(dt);
    this.upsideDownFx?.update(dt);
    this.triadVisualFx?.update(dt);
    this.wave4VisualFx?.update(dt);
    this.restScene?.update(dt);
    this.cinematics.update(dt);
    const inputLocked = this.combatInputLock?.blocksInput?.() || this.combatCamera?.blocksInput?.();
    const canPlay = !this.dialog.open && !this.upgrade.open && !this.cinematicActive
      && !this.paused && !this.settingsPanel.open && !this.fastTravelPanel.open && !this.helpManual.open
      && !this.worldMapPanel?.open
      // 日志抽屉（切片27 / 修 B57）：它进了层表之后才发现这里少问一格 —— 摇杆在界面态里既推着
      // 那一格的走焦、又还在推玩家走路（真浏览器读数 K3：开着日志 `mag` 0.972、速度 26.98 m/s）。
      // 一根输入两个消费者，与 B52 同族；这里按既有形状补上"这一层开着就不玩"
      && !this.hud?.journalOpen
      && !inputLocked
      && !this.autoPlayMode;

    if (this.autoPlayMode && this.playerAutoPlay?.active) {
      this.playerAutoPlay.update(dt);
    }

    const playing = canPlay || this.autoPlayMode;

    if (playing) {
      this.weapons.update(dt, this.keys);
      const sk = this.weaponSkills.getModifiers();
      this.player.combat.weaponMeleeMult = this.weapons.meleeMult * (1 + sk.melee);
      this.player.combat.weaponSkillMult = this.weapons.skillMult * (1 + sk.spell * 0.5);
      this.player.combat.skillMods = sk;
      this.spells.weaponSpellMult = this.weapons.spellMult * (1 + sk.spell);
      this.spells.bonusMana = sk.mana ?? 0;
      this.spells.chargeBonus = sk.charge ?? 0;
      this.spells.transformBonus = sk.transform ?? 0;
      // 左摇杆的模拟量与 `keys` 同帧喂进去（`padInput.poll()` 在本帧更早处已算好 `move` 那枚复用槽）；
      // 没有手柄时 `move.mag` 为 0，走八向码的满速路径，键盘手感逐字不变
      this.player.update(
        dt,
        this.autoPlayMode ? {} : this.keys,
        this.autoPlayMode ? null : this.padInput?.move ?? null,
      );
      this.spells.update(dt, this.keys);
      this.fastTravel.tryOpen(this.keys);
      this.enemyManager.update(dt, this.player.position, this.player, this.loot, this);
      this.projectiles.update(dt, this.player.position, this.player);
    }
    this.dungeons.update(dt);
    this.loot.update(dt, this.player.position);
    // 自动演示要出干净的截图：静帧时不接收新请求，但已起的抖按 dt 走完
    this.shake.muted = this.autoPlayMode;
    this.shake.update(dt);
    /* 震动按 `rawDt` 结账（切片17）：马达是物理设备，命中停顿/慢动作把那 120 毫秒拉成半秒
     * 不是手感，是把手掌震麻。`muted` 已经在 `Shake.add` 那道闸上把自动演示一起挡掉了 */
    this.rumble.update(rawDt);
    this.damageNumbers.update(dt);
    this.combatFeedback.update(dt);
    // 处决特效跟着 dt 走：hitstop 期间那一圈冲击环必须一起变慢（修 B43）
    this.executionFx.update(dt);
    this.world.update(dt, this.player.position);
    this.explorationMap?.update(this.player.position);
    this.ambientPass?.update(dt, this.player.position);
    if (this.worldMapPanel?.open) this.worldMapPanel.draw();
    this.worldEffects.update(dt, this.player.position);
    this.weather.update(dt, this.player.position);
    this.restNpcs.update(dt, this.player.position);
    this.restNpcAnimDirector?.update(dt, this.player.position);
    this.restNpcIdle?.update(dt, this.player.position);
    this.restCampfireAmbient?.update(dt, this.player.position);
    this.restPointEnhancer?.update(dt, this.player.position);
    this.soulWisps.update(dt, this.player.position);
    const zoneId = this.world.zoneId;
    this.voidEcho.update(dt, this.player.position, this.player.yaw, zoneId === ZONE_IDS.VOID);
    this.chaosLightning.update(dt, this.player.position, zoneId === ZONE_IDS.ABYSS);
    this.restPoints.update(dt);
    this.npcs.update(dt);
    this.hud.update(dt);
    this.gameGuide?.update();
    this.questAssistant.update(dt);
    this.worldAmbient?.update(dt, this.player.position);
    if (playing) {
      this.bossRematch?.update(dt, this.player.position);
      this.bossApproach?.update(dt, this.player.position);
      this.bossPhaseDirector?.update(dt);
    }
    /* 相机所有者的收尾：FOV 增量按帧申领，这一笔落下之后本帧的申领就清零 ——
     * 没有任何系统需要"记得恢复基准"（M3：相机唯一写入者）。
     * commitView 用 rawDt 推进一次"所有权交接补间"（进出过场/观看模式的软接，W-A5 切片1，短板 A4）：
     * 走过场和 UI 节奏同一口径，hitstop / 慢动作不该把一次镜头交接拉长。 */
    this.player.rig.commitFov();
    this.player.rig.commitView(rawDt);
    this.updateDayNight(dt);
    this.updateSunFollow();
    this.updateBloom();
    this.performance.updateSunShadow(this.sun, this.player.position, this.settings.get('shadows'));
  }

  updateBloom() {
    const base = this.settings.get('bloomStrength');
    const zoneId = this.world.zoneId;
    if (zoneId === ZONE_IDS.MAGIC) this.bloomPass.strength = base + 0.2;
    else if (zoneId === ZONE_IDS.SPACE) this.bloomPass.strength = base + 0.1;
    else this.bloomPass.strength = base;
  }

  updateDayNight(dt) {
    this.timeOfDay = (this.timeOfDay + dt * 0.005) % 1;
    const daylight = 0.55 + Math.max(0, Math.sin(this.timeOfDay * Math.PI * 2)) * 0.45;
    this.sun.intensity = 0.9 + daylight * 0.85;
    this.ambient.intensity = 0.58 + daylight * 0.22;
    this.renderer.toneMappingExposure = 1.08 + daylight * 0.38;
    // 区域雾跟昼夜同一个算式源：明度由 daylight 调制（正午原色），跨区由
    // zoneFog 自己的指数平滑收敛 —— fog 的写权限在这里面，别处不许碰
    this.zoneFog.update(dt, this.world.zoneId, daylight);
    // 分级跟雾同一个驱动节奏：换区指数平滑收敛，uniforms 写权限在 ColorGrade 里面
    this.colorGrade.update(dt, this.world.zoneId);
    if (this.skyUniforms) {
      const phi = THREE.MathUtils.degToRad(88 - daylight * 18);
      const theta = this.timeOfDay * Math.PI * 2;
      this.skyUniforms.sunPosition.value.set(
        Math.cos(theta) * Math.cos(phi),
        Math.sin(phi),
        Math.sin(theta) * Math.cos(phi)
      );
    }
  }

  updateSunFollow() {
    const p = this.player.position;
    const a = this.timeOfDay * Math.PI * 2;
    this.sun.position.set(p.x + Math.cos(a) * 100, 55 + Math.sin(a) * 85, p.z + Math.sin(a) * 60);
  }

  render() {
    // 帧界：清零后 composer.render() 里所有趟都记进本帧（autoReset 已关，见构造函数）
    this.renderer.info.reset();
    this.composer.render();
    this.labelRenderer.render(this.scene, this.camera);
  }

  run() {
    // rAF-EXCEPTION：全仓唯一的时间源。所有游戏逻辑计时都必须从这里派生的 dt 走，
    // 别处再开一条 rAF 就是在私造时间轴（B43 的成因）。
    const loop = () => { requestAnimationFrame(loop); this.update(); this.render(); };
    loop();
  }
}
