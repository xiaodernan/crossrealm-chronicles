import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { PlayerController } from '../player/PlayerController.js';
import { WorldManager } from '../world/WorldManager.js';
import { TimeController } from '../engine/Time.js';
import { shake } from '../engine/Shake.js';
import { scheduler } from '../engine/Scheduler.js';
import { PerfHUD } from '../engine/PerfHUD.js';
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
import { attachPopCultureCgRenderer } from '../ui/DialogCGRendererPopCulture.js';
import { attachPopCultureSideQuests } from '../game/SideQuestPopCulture.js';
import { attachPopCultureCombatBarks } from '../game/PopCultureCombatBarks.js';
import { ZONE_IDS } from '../world/ZoneIdentity.js';
export class Game {
  constructor(container) {
    this.clock = new THREE.Clock();
    /** 主循环唯一时间来源：dt 上限、timeScale（hitstop/慢动作）、固定步长累加器 */
    this.time = new TimeController();
    this.keys = {};
    this.pointerLocked = false;
    this.timeOfDay = 0.35;
    this.container = container;
    this.paused = false;
    this.cinematicActive = false;
    this.spectatorMode = false;
    this.autoPlayMode = false;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x8aa8c8, 0.0038);

    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 2500);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
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

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
    this.labelRenderer.domElement.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2';
    container.appendChild(this.labelRenderer.domElement);

    this.audio = new AudioManager();
    this.stats = new PlayerStats();
    this.dialog = new Dialog();
    this.dialogCg = new DialogCGRenderer();
    attachPopCultureCgRenderer(this.dialogCg);
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
    this.weather = new WeatherSystem(this.scene, this.world);
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

    this.damageNumbers = new DamageNumbers(this.scene);
    /** 震屏：全局唯一实例，各战斗/法术系统直接 `addShake()` 请求，主循环只在这里推进 */
    this.shake = shake;
    this.combatFeedback = new CombatFeedback(this.scene);
    this.projectiles = new ProjectileManager(this.scene, this.audio);
    this.loot = new LootSystem(this.scene, this.stats, this.audio);
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

    this.hud = new HUD(this);
    this.upgrade = new UpgradePanel(this);
    this.helpManual = new HelpManual(this);
    this.tutorial = new Tutorial(this.dialog, this.helpManual, this);
    this.cinematics = new CinematicManager(this);
    this.combatCamera = new CombatCameraDirector(this);
    attachCombatCameraSkip(this.combatCamera, this);
    this.combatCinematicSkip = new CombatCinematicSkip(this);
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

    // F3：GPU 对象与场景规模只增不减 = 泄漏；数值全部经公开接口取，不翻系统内部字段
    this.perfHud = new PerfHUD({ renderer: this.renderer, scene: this.scene })
      .gauge('存活敌人', () => this.enemyManager.getAliveEnemies().length)
      .gauge('敌方弹体', () => this.projectiles.count())
      .gauge('法术效果', () => this.spells.count())
      .gauge('飘字', () => this.damageNumbers.activeCount())
      .gauge('火花', () => this.combatFeedback.activeCount());

    this.setupLights();
    this.ambientPass = new AmbientScenePass(this);
    this.setupInput();
    this.setupEvents();
    SaveSystem.load(this);
    this.restNpcAnimDirector.attachRestNpcs(this.restNpcs.npcs);
    this.restNpcIdle.attachRestNpcs(this.restNpcs.npcs);
    attachCgGalleryExtras(this.cgGallery);
    attachAchievementExtras(this.achievements);
    attachPopCultureSideQuests(this.sideQuests);
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
      const fn = e.detail.sfx;
      if (fn && typeof this.audio[fn] === 'function') this.audio[fn]();
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
    this.sun.shadow.mapSize.set(4096, 4096);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 450;
    this.sun.shadow.camera.left = -140;
    this.sun.shadow.camera.right = 140;
    this.sun.shadow.camera.top = 140;
    this.sun.shadow.camera.bottom = -140;
    this.scene.add(this.sun);
  }

  setupInput() {
    const canvas = this.renderer.domElement;

    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (this.upgrade.open || this.dialog.open) return;
      if (this.pauseMenu.open || this.settingsPanel.open || this.fastTravelPanel.open || this.helpManual.open) return;
      if (this.worldMapPanel?.open && e.code !== 'KeyG' && e.code !== 'Escape' && e.code !== 'Tab') return;

      if (e.code === 'KeyH') {
        e.preventDefault();
        this.helpManual.toggle();
        return;
      }

      if (e.code === 'KeyM') this.hud.toggleMinimap();
      if (e.code === 'KeyG') this.worldMapPanel?.toggle();
      if (e.code === 'KeyV') this.player.toggleCameraMode();
      if (e.code === 'Tab' && this.worldMapPanel?.open) {
        e.preventDefault();
        this.mapMarkers.cycleActive();
        this.worldMapPanel.draw();
        return;
      }
      if (e.code === 'Tab') { e.preventDefault(); this.hud.toggleZonePanel(); }
      if (e.code === 'KeyU') this.questAssistant.toggle();
      if (e.code === 'KeyN') {
        e.preventDefault();
        this.questAssistant.startAutoPlay();
      }
      if (e.code === 'KeyJ') this.hud.toggleJournal();
      if (e.code === 'F2') { e.preventDefault(); this.photoMode?.toggle(); }
      if (e.code === 'F3') { e.preventDefault(); this.perfHud?.toggle(); }
      if (e.code === 'Backquote') { e.preventDefault(); this.sessionStats?.toggle(); }
      if (e.code === 'KeyP') SaveSystem.save(this);
      if (e.code === 'KeyL') SaveSystem.load(this);
      if (e.code === 'Escape') {
        if (this.endCredits?.trySkip?.()) return;
        if (this.combatCinematicSkip?.canSkip?.()) return;
        if (this.worldMapPanel?.open) { this.worldMapPanel.hide(); return; }
        if (this.playerAutoPlay?.active) { this.playerAutoPlay.stop(false); return; }
        if (this.helpManual.open) { this.helpManual.hide(); return; }
        if (this.cinematicActive) this.cinematics.skip();
        else this.pauseMenu.toggle();
      }
      if (e.code === 'F10') this.settingsPanel.show();
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
      if (this.autoPlayMode || !this.pointerLocked || this.dialog.open || this.upgrade.open) return;
      if (this.combatInputLock?.blocksInput?.()) return;
      if (e.button === 0) this.player.combat.mouseDown.left = true;
      if (e.button === 2) this.player.combat.mouseDown.right = true;
    });

    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === canvas;
    });

    document.addEventListener('mousemove', (e) => {
      if (this.autoPlayMode) return;
      if (this.combatInputLock?.blocksCamera?.()) return;
      if (this.pointerLocked && !this.dialog.open && !this.upgrade.open) {
        this.player.addCameraInput(e.movementX, e.movementY);
      }
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
    this.combatCamera.update(rawDt);
    this.combatInputLock.update(rawDt);
    const dt = rawDt * this.time.timeScale * this.combatCamera.getTimeScale();
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
      this.player.update(dt, this.autoPlayMode ? {} : this.keys);
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
    }
    /* 相机所有者的收尾：FOV 增量按帧申领，这一笔落下之后本帧的申领就清零 ——
     * 没有任何系统需要"记得恢复基准"（M3：相机唯一写入者） */
    this.player.rig.commitFov();
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
