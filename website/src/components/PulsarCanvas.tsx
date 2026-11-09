import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const TIK_CYAN = 0x25f4ee;
const TIK_PINK = 0xfe2c55;
const TIK_VIOLET = 0x8f6cff;
const TIK_CYAN_CLARO = 0x9ffcf7;
const TIK_PINK_CLARO = 0xff8fae;

const LOOK = {
  star: { radioHalo: 1.16 },
  disk: {
    radioInterno: 1.18,
    radioExterno: 5.4,
    grosorInterno: 0.15,
    grosorExterno: 0.45,
    turbulence: 0.5,
    arms: 3,
    armStrength: 0.2,
    spiralPitch: 3.2,
    waveSpeed: 0.0,
    omegaInner: 2.4,
    radialFlow: 0.065,
    noiseDrift: 0.06,
    fogHeight: 2.8,
    massOpacity: 0.6,
    emissionBrightness: 0.55,
    fogBrightness: 0.1,
    currentsOpacity: 0.05,
    curtainsBrightness: 0.34,
    segAng: 160,
    segRad: 96,
    ribbonRows: 160,
    curtains: 3,
    giroGrupo: 0.4,
  },
  jets: { length: 11.2, brightness: 1.45, flowSpeed: 1.5 },
  pulse: { periodo: 1.6, eyecciones: 2 },
  post: {
    exposure: 0.98,
    bloom: 0.88,
    bloomRadius: 0.52,
    bloomThreshold: 0.5,
    bloomScale: 0.75,
    msaa: 0,
  },
  quality: {
    minScale: 0.6,
    step: 0.12,
    window: 50,
    highMs: 24,
    lowMs: 14,
    maxAjustes: 3,
    cooldownMs: 1800,
  },
};

const CAPAS_GAS = [
  { capa: -1.0, semilla: 17.3, vel: 0.96, escala: 0.45, brillo: 0.46 },
  { capa: 1.0, semilla: 53.7, vel: 1.02, escala: 0.7, brillo: 0.38 },
];

export const PulsarCanvas: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const lienzo = canvasRef.current;
    const cont = containerRef.current;
    if (!lienzo || !cont) return;

    let animId: number;
    const DPR_MAX = Math.min(window.devicePixelRatio || 1, 1.25);

    const getWidth = () => cont.clientWidth || window.innerWidth;
    const getHeight = () => cont.clientHeight || window.innerHeight;

    // Renderer configurado para fondo negro absoluto sin filtración de luz
    const renderer = new THREE.WebGLRenderer({
      canvas: lienzo,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(DPR_MAX);
    renderer.setSize(getWidth(), getHeight());
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = LOOK.post.exposure;
    renderer.setClearColor(0x000000, 1);

    const escena = new THREE.Scene();
    escena.background = new THREE.Color(0x000000);

    const CAPA_BASE = 0;
    const CAPA_BLOOM = 1;
    const camara = new THREE.PerspectiveCamera(
      42,
      getWidth() / getHeight(),
      0.1,
      600
    );
    camara.layers.enable(CAPA_BASE);
    camara.layers.enable(CAPA_BLOOM);

    // Ajuste de cámara estática y perspectiva cinemática de disco de acreción (perspectiva de plato)
    const DISTANCIA_CAM = 21.0;
    const ELEVACION_CAM = 0.52;

    function ajustarCamara() {
      const w = getWidth();
      const h = getHeight();
      camara.aspect = w / h;
      camara.updateProjectionMatrix();

      // Posición fija de cámara con ángulo cenital para vista de disco de acreción
      camara.position.set(0, DISTANCIA_CAM * ELEVACION_CAM, DISTANCIA_CAM);
      camara.lookAt(0, 0, 0);

      // Desplazamiento y rotación del pulsar en auténtica perspectiva de plato (abierto y equilibrado)
      if (w < 640) {
        // En móviles: centrado-derecha
        púlsarRoot.position.set(1.2, -0.55, 0);
        púlsarRoot.scale.setScalar(1.25);
        púlsarRoot.rotation.set(0.38, 0.06, -0.03);
      } else if (w < 1024) {
        // En tablets: hacia la derecha
        púlsarRoot.position.set(3.6, -0.5, 0);
        púlsarRoot.scale.setScalar(1.4);
        púlsarRoot.rotation.set(0.38, 0.17, -0.04);
      } else {
        // En desktops: desplazado a la derecha en amplia perspectiva de plato
        púlsarRoot.position.set(5.2, -0.45, 0);
        púlsarRoot.scale.setScalar(1.55);
        púlsarRoot.rotation.set(0.38, 0.24, -0.04);
      }
    }

    // ==========================================
    // CAMPO DE ESTRELLAS CÓSMICAS (Twinkling Starfield)
    // ==========================================
    const TOTAL_ESTRELLAS = 1400;
    const posEstrellas = new Float32Array(TOTAL_ESTRELLAS * 3);
    const colorEstrellas = new Float32Array(TOTAL_ESTRELLAS * 3);
    const sizeEstrellas = new Float32Array(TOTAL_ESTRELLAS);
    const phaseEstrellas = new Float32Array(TOTAL_ESTRELLAS);
    const speedEstrellas = new Float32Array(TOTAL_ESTRELLAS);

    const cBlanco = new THREE.Color(0xf6f8ff);
    const cCyan = new THREE.Color(TIK_CYAN);
    const cRosa = new THREE.Color(TIK_PINK);

    for (let i = 0; i < TOTAL_ESTRELLAS; i++) {
      // Distribución esférica profunda en el cosmos
      const dist = 35 + Math.random() * 95;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      posEstrellas[i * 3] = dist * Math.sin(phi) * Math.cos(theta);
      posEstrellas[i * 3 + 1] = dist * Math.sin(phi) * Math.sin(theta);
      posEstrellas[i * 3 + 2] = dist * Math.cos(phi);

      // Variación de brillo y color (mayoría blancas con toques cian y rosa TikTok)
      const randColor = Math.random();
      let chosenColor = cBlanco;
      if (randColor > 0.92) {
        chosenColor = cCyan;
      } else if (randColor > 0.85) {
        chosenColor = cRosa;
      }

      colorEstrellas[i * 3] = chosenColor.r;
      colorEstrellas[i * 3 + 1] = chosenColor.g;
      colorEstrellas[i * 3 + 2] = chosenColor.b;

      // Tamaños y velocidades de parpadeo
      sizeEstrellas[i] = 0.8 + Math.random() * 2.2;
      phaseEstrellas[i] = Math.random() * Math.PI * 2;
      speedEstrellas[i] = 0.6 + Math.random() * 2.2;
    }

    const geoEstrellas = new THREE.BufferGeometry();
    geoEstrellas.setAttribute(
      'position',
      new THREE.BufferAttribute(posEstrellas, 3)
    );
    geoEstrellas.setAttribute(
      'aColor',
      new THREE.BufferAttribute(colorEstrellas, 3)
    );
    geoEstrellas.setAttribute(
      'aSize',
      new THREE.BufferAttribute(sizeEstrellas, 1)
    );
    geoEstrellas.setAttribute(
      'aPhase',
      new THREE.BufferAttribute(phaseEstrellas, 1)
    );
    geoEstrellas.setAttribute(
      'aSpeed',
      new THREE.BufferAttribute(speedEstrellas, 1)
    );

    const uniformesEstrellas = {
      uTiempo: { value: 0 },
      uPixelRatio: { value: DPR_MAX },
    };

    const matEstrellas = new THREE.ShaderMaterial({
      uniforms: uniformesEstrellas,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aPhase;
        attribute float aSpeed;
        uniform float uTiempo;
        uniform float uPixelRatio;
        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          vColor = aColor;
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          float twinkle = 0.35 + 0.65 * abs(sin(uTiempo * aSpeed + aPhase));
          vAlpha = twinkle;
          float scale = 32.0 / max(1.0, -mvPos.z);
          gl_PointSize = aSize * uPixelRatio * scale * (0.8 + 0.35 * twinkle);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float dist = length(uv);
          if (dist > 0.5) discard;
          float core = smoothstep(0.12, 0.0, dist);
          float halo = smoothstep(0.5, 0.0, dist);
          float alpha = halo * 0.7 + core * 0.3;
          vec3 col = mix(vColor, vec3(1.0), core * 0.75);
          gl_FragColor = vec4(col, alpha * vAlpha);
        }
      `,
    });

    const puntosEstrellas = new THREE.Points(geoEstrellas, matEstrellas);
    puntosEstrellas.layers.set(CAPA_BASE);
    escena.add(puntosEstrellas);

    // ==========================================
    // SISTEMA DEL PÚLSAR (Perspectiva canónica de disco de acreción)
    // ==========================================
    const púlsarRoot = new THREE.Group();
    // Orientación canónica de disco de acreción en perspectiva de plato
    púlsarRoot.rotation.set(0.38, 0.24, -0.04);
    escena.add(púlsarRoot);

    const U_GLOBAL = {
      tiempo: { value: 0 },
      sobretension: { value: 0 },
      pulso: { value: 0 },
      fasePulso: { value: 0 },
      pixelRatio: { value: DPR_MAX },
    };
    const PERIODO_PULSO = LOOK.pulse.periodo;
    const EYECCIONES = LOOK.pulse.eyecciones;
    const JET_DESFASE = 0.0;

    function calcularPulso(tiempo: number, desfase: number) {
      let f = ((tiempo + desfase) % PERIODO_PULSO) / PERIODO_PULSO;
      if (f < 0) f += 1;
      const sub = (f * EYECCIONES) % 1.0;
      const crudo = Math.max(0, 1 - sub * 3.0);
      return { fase: f, pulso: Math.pow(crudo, 1.8) };
    }

    const RADIO = 1.7;
    const INCLINACION_MAGNETICA = 0.12;
    const DOS_PI = Math.PI * 2;
    const DISCO_RADIO_INTERNO = RADIO * LOOK.disk.radioInterno;
    const DISCO_RADIO_EXTERNO = RADIO * LOOK.disk.radioExterno;
    const DISCO_GROSOR_INTERNO = RADIO * LOOK.disk.grosorInterno;
    const DISCO_GROSOR_EXTERNO = RADIO * LOOK.disk.grosorExterno;
    const JET_LARGO = LOOK.jets.length;

    function crearTexturaAura() {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const g = c.getContext('2d')!;
      const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
      gr.addColorStop(0, 'rgba(190,222,255,0.70)');
      gr.addColorStop(0.12, 'rgba(146,194,255,0.30)');
      gr.addColorStop(0.3, 'rgba(112,152,250,0.11)');
      gr.addColorStop(0.55, 'rgba(98,120,238,0.032)');
      gr.addColorStop(1, 'rgba(84,98,205,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 256, 256);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    }
    const texAura = crearTexturaAura();

    const grupoEsfera = new THREE.Group();
    púlsarRoot.add(grupoEsfera);
    const grupoDisco = new THREE.Group();
    grupoEsfera.add(grupoDisco);
    const grupoEje = new THREE.Group();
    grupoEje.rotation.z = INCLINACION_MAGNETICA;
    grupoEsfera.add(grupoEje);

    function marcarBloom<T extends THREE.Object3D>(o: T): T {
      o.layers.set(CAPA_BLOOM);
      return o;
    }

    const esfera = new THREE.Mesh(
      new THREE.SphereGeometry(RADIO, 96, 96),
      new THREE.MeshPhysicalMaterial({
        color: 0x141838,
        metalness: 0.5,
        roughness: 0.25,
        clearcoat: 1.0,
        clearcoatRoughness: 0.12,
        sheen: 0.5,
        sheenColor: new THREE.Color(TIK_CYAN),
      })
    );
    esfera.layers.set(CAPA_BASE);
    grupoEsfera.add(esfera);

    const phi = (1 + Math.sqrt(5)) / 2;
    const nodosBase = [
      new THREE.Vector3(-1, phi, 0),
      new THREE.Vector3(1, phi, 0),
      new THREE.Vector3(-1, -phi, 0),
      new THREE.Vector3(1, -phi, 0),
      new THREE.Vector3(0, -1, phi),
      new THREE.Vector3(0, 1, phi),
      new THREE.Vector3(0, -1, -phi),
      new THREE.Vector3(0, 1, -phi),
      new THREE.Vector3(phi, 0, -1),
      new THREE.Vector3(phi, 0, 1),
      new THREE.Vector3(-phi, 0, -1),
      new THREE.Vector3(-phi, 0, 1),
    ];
    const carasBase = [
      [0, 11, 5],
      [0, 5, 1],
      [0, 1, 7],
      [0, 7, 10],
      [0, 10, 11],
      [1, 5, 9],
      [5, 11, 4],
      [11, 10, 2],
      [10, 7, 6],
      [7, 1, 8],
      [3, 9, 4],
      [3, 4, 2],
      [3, 2, 6],
      [3, 6, 8],
      [3, 8, 9],
      [4, 9, 5],
      [2, 4, 11],
      [6, 2, 10],
      [8, 6, 7],
      [9, 8, 1],
    ];
    let nodos = nodosBase.map((v) => v.clone());
    let caras = carasBase.map((c) => c.slice());
    for (let p = 0; p < 3; p++) {
      const cache = new Map<string, number>();
      const nc: number[][] = [];
      const pm = (iA: number, iB: number) => {
        const k = iA < iB ? iA + '_' + iB : iB + '_' + iA;
        if (cache.has(k)) return cache.get(k)!;
        const m = nodos[iA]
          .clone()
          .add(nodos[iB])
          .multiplyScalar(0.5)
          .normalize();
        nodos.push(m);
        const idx = nodos.length - 1;
        cache.set(k, idx);
        return idx;
      };
      for (const [a, b, c] of caras) {
        const ab = pm(a, b);
        const bc = pm(b, c);
        const ca = pm(c, a);
        nc.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
      }
      caras = nc;
    }

    const aleatorio = (function (s) {
      return function () {
        s = (s * 16807) % 2147483647;
        return (s - 1) / 2147483646;
      };
    })(20240607);

    const dirTemp = new THREE.Vector3();
    const ruidoTemp = new THREE.Vector3();
    for (let i = 0; i < nodos.length; i++) {
      dirTemp.copy(nodos[i]).normalize();
      const it = 0.16 + aleatorio() * 0.3;
      ruidoTemp
        .set(
          aleatorio() * 2 - 1,
          aleatorio() * 2 - 1,
          aleatorio() * 2 - 1
        )
        .multiplyScalar(it);
      dirTemp.add(ruidoTemp).normalize();
      nodos[i].copy(dirTemp);
    }

    const setAristas = new Set<string>();
    const aristas: [number, number][] = [];
    for (const cara of caras) {
      const [a, b, c] = cara;
      for (const [i1, i2] of [
        [a, b],
        [b, c],
        [c, a],
      ]) {
        const k = i1 < i2 ? i1 + '|' + i2 : i2 + '|' + i1;
        if (!setAristas.has(k)) {
          setAristas.add(k);
          aristas.push([i1, i2]);
        }
      }
    }

    const RADIO_MALLA = RADIO * 1.014;
    const totalAristas = aristas.length;
    const posicionesMalla = new Float32Array(totalAristas * 6);
    const atributoT = new Float32Array(totalAristas * 2);
    const atributoSemilla = new Float32Array(totalAristas * 2);
    const atributoVelocidad = new Float32Array(totalAristas * 2);
    const atributoFase = new Float32Array(totalAristas * 2);
    const atributoColor = new Float32Array(totalAristas * 6);
    const colorFrio = new THREE.Color(TIK_CYAN);
    const colorMedio = new THREE.Color(TIK_VIOLET);
    const colorCalido = new THREE.Color(TIK_PINK);
    const colorTemp = new THREE.Color();

    for (let i = 0; i < totalAristas; i++) {
      const [i1, i2] = aristas[i];
      const p1 = nodos[i1];
      const p2 = nodos[i2];
      const b = i * 6;
      posicionesMalla[b] = p1.x * RADIO_MALLA;
      posicionesMalla[b + 1] = p1.y * RADIO_MALLA;
      posicionesMalla[b + 2] = p1.z * RADIO_MALLA;
      posicionesMalla[b + 3] = p2.x * RADIO_MALLA;
      posicionesMalla[b + 4] = p2.y * RADIO_MALLA;
      posicionesMalla[b + 5] = p2.z * RADIO_MALLA;

      const sem = aleatorio();
      const vel = 0.22 + aleatorio() * 0.85;
      const fase = aleatorio();
      atributoT[i * 2] = 0;
      atributoT[i * 2 + 1] = 1;
      atributoSemilla[i * 2] = sem;
      atributoSemilla[i * 2 + 1] = sem;
      atributoVelocidad[i * 2] = vel;
      atributoVelocidad[i * 2 + 1] = vel;
      atributoFase[i * 2] = fase;
      atributoFase[i * 2 + 1] = fase;

      const alt = (p1.y + p2.y) * 0.5;
      const tN = alt * 0.5 + 0.5;
      if (tN < 0.5) colorTemp.copy(colorFrio).lerp(colorMedio, tN * 2);
      else colorTemp.copy(colorMedio).lerp(colorCalido, (tN - 0.5) * 2);
      atributoColor[b] = colorTemp.r;
      atributoColor[b + 1] = colorTemp.g;
      atributoColor[b + 2] = colorTemp.b;
      atributoColor[b + 3] = colorTemp.r;
      atributoColor[b + 4] = colorTemp.g;
      atributoColor[b + 5] = colorTemp.b;
    }

    const geometriaMalla = new THREE.BufferGeometry();
    geometriaMalla.setAttribute(
      'position',
      new THREE.BufferAttribute(posicionesMalla, 3)
    );
    geometriaMalla.setAttribute('aT', new THREE.BufferAttribute(atributoT, 1));
    geometriaMalla.setAttribute(
      'aSemilla',
      new THREE.BufferAttribute(atributoSemilla, 1)
    );
    geometriaMalla.setAttribute(
      'aVelocidad',
      new THREE.BufferAttribute(atributoVelocidad, 1)
    );
    geometriaMalla.setAttribute(
      'aFase',
      new THREE.BufferAttribute(atributoFase, 1)
    );
    geometriaMalla.setAttribute(
      'aColor',
      new THREE.BufferAttribute(atributoColor, 3)
    );

    const uniformesMalla = {
      uTiempo: { value: 0 },
      uSobretension: { value: 0 },
    };
    const materialMalla = new THREE.ShaderMaterial({
      uniforms: uniformesMalla,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      vertexShader: `attribute float aT; attribute float aSemilla; attribute float aVelocidad; attribute float aFase; attribute vec3 aColor; varying float vT; varying float vSemilla; varying float vVelocidad; varying float vFase; varying vec3 vColor; void main(){ vT=aT; vSemilla=aSemilla; vVelocidad=aVelocidad; vFase=aFase; vColor=aColor; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `precision highp float; uniform float uTiempo; uniform float uSobretension; varying float vT; varying float vSemilla; varying float vVelocidad; varying float vFase; varying vec3 vColor;
        float hash(float n){ return fract(sin(n)*43758.5453123); }
        void main(){
          float centro=fract(uTiempo*vVelocidad+vFase);
          float dist=abs(vT-centro); dist=min(dist,1.0-dist);
          float ancho=0.045;
          float paquete=exp(-(dist*dist)/(2.0*ancho*ancho));
          float detras=fract(vT-centro+1.0);
          float estela=exp(-detras*9.0)*0.55;
          float tramo=floor(uTiempo*0.85+vSemilla*13.0);
          float h=hash(tramo*1.7+vSemilla*91.3);
          float activa=smoothstep(0.42,0.60,h);
          float chispa=0.55+0.45*sin(uTiempo*47.0+vSemilla*210.0);
          chispa*=0.7+0.3*sin(uTiempo*15.0+vSemilla*44.0);
          float flujo=0.085+0.05*sin(vT*24.0-uTiempo*4.5+vSemilla*31.0);
          float arco=activa*pow(max(0.0,sin(uTiempo*6.0+vSemilla*55.0)),40.0)*1.6;
          float energia=flujo+(paquete*2.6+estela)*activa*chispa+arco*chispa+uSobretension*activa*0.85;
          vec3 col=vColor*(0.30+energia);
          float nucleo=paquete*activa;
          col += mix(vColor, vec3(1.0), 0.45) * pow(nucleo,1.5)*2.8;
          col += mix(vColor, vec3(1.0), 0.70) * pow(max(0.0,nucleo-0.7),2.0)*9.0;
          col += mix(vColor, vec3(1.0), 0.50) * arco*1.5;
          gl_FragColor=vec4(col,1.0);
        }`,
    });
    const mallaElectrica = new THREE.LineSegments(
      geometriaMalla,
      materialMalla
    );
    marcarBloom(mallaElectrica);
    mallaElectrica.renderOrder = 2;
    grupoEsfera.add(mallaElectrica);

    const posicionesNodos = new Float32Array(nodos.length * 3);
    const semillasNodos = new Float32Array(nodos.length);
    for (let i = 0; i < nodos.length; i++) {
      posicionesNodos[i * 3] = nodos[i].x * RADIO_MALLA;
      posicionesNodos[i * 3 + 1] = nodos[i].y * RADIO_MALLA;
      posicionesNodos[i * 3 + 2] = nodos[i].z * RADIO_MALLA;
      semillasNodos[i] = aleatorio() * 100.0;
    }
    const geometriaNodos = new THREE.BufferGeometry();
    geometriaNodos.setAttribute(
      'position',
      new THREE.BufferAttribute(posicionesNodos, 3)
    );
    geometriaNodos.setAttribute(
      'aSemillaNodo',
      new THREE.BufferAttribute(semillasNodos, 1)
    );
    const uniformesNodos = {
      uTiempo: { value: 0 },
      uPixelRatio: { value: DPR_MAX },
      uCian: { value: new THREE.Color(TIK_CYAN) },
      uPink: { value: new THREE.Color(TIK_PINK) },
    };
    const materialNodos = new THREE.ShaderMaterial({
      uniforms: uniformesNodos,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `attribute float aSemillaNodo; uniform float uTiempo; uniform float uPixelRatio; varying float vBrillo; varying float vMix; void main(){ vec4 mvPos=modelViewMatrix*vec4(position,1.0); float h=fract(sin(aSemillaNodo*127.1)*43758.5453); float destello=pow(max(0.0,sin(uTiempo*2.6+h*26.0)),12.0); vBrillo=0.18+destello; vMix=h; float escala=20.8/max(0.001,-mvPos.z); gl_PointSize=(1.6+destello*11.0)*uPixelRatio*escala; gl_Position=projectionMatrix*mvPos; }`,
      fragmentShader: `precision highp float; uniform vec3 uCian; uniform vec3 uPink; varying float vBrillo; varying float vMix; void main(){ vec2 uv=gl_PointCoord-0.5; float dist=length(uv); if(dist>0.5) discard; float suave=smoothstep(0.5,0.0,dist); float nucleo=smoothstep(0.18,0.0,dist); vec3 base=mix(uCian,uPink,vMix); vec3 col=base*suave*(0.8+vBrillo*2.6); col+=mix(base,vec3(1.0),0.55)*nucleo*vBrillo*3.0; gl_FragColor=vec4(col,suave); }`,
    });
    const puntosNodos = new THREE.Points(geometriaNodos, materialNodos);
    marcarBloom(puntosNodos);
    puntosNodos.renderOrder = 3;
    grupoEsfera.add(puntosNodos);

    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(RADIO * LOOK.star.radioHalo, 48, 48),
      new THREE.MeshBasicMaterial({
        color: TIK_CYAN,
        transparent: true,
        opacity: 0.05,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    grupoEsfera.add(halo);

    /* ===================== DISCO DE ACRECIÓN ===================== */
    const GLSL_DISCO = `
      uniform float uTiempo; uniform float uSobretension; uniform float uPulso;
      uniform float uRadioInterno; uniform float uRadioExterno; uniform float uGrosorInterno; uniform float uGrosorExterno;
      uniform float uOmegaInterior; uniform float uBrazos; uniform float uPasoEspiral; uniform float uVelOnda;
      uniform float uAmplitudBrazo; uniform float uRuidoAmp; uniform float uAlturaCapa; uniform float uSemillaCapa;
      uniform float uVelCapa; uniform float uFlujoRadial; uniform float uFlujoRuido; uniform float uEscalaNiebla;
      uniform float uCapa; uniform float uModoNiebla;
      const float T_SHEAR = 8.0;
      const float T_DRIFT = 20.0;
      const float GIRO_RIGIDO = 0.0;
      float hashDisco(vec3 p){ p=fract(p*vec3(0.1031,0.1030,0.0973)); p+=dot(p,p.yzx+33.33); return fract((p.x+p.y)*p.z); }
      float ruidoDisco3(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
        float n000=hashDisco(i); float n100=hashDisco(i+vec3(1,0,0)); float n010=hashDisco(i+vec3(0,1,0)); float n110=hashDisco(i+vec3(1,1,0));
        float n001=hashDisco(i+vec3(0,0,1)); float n101=hashDisco(i+vec3(1,0,1)); float n011=hashDisco(i+vec3(0,1,1)); float n111=hashDisco(i+vec3(1,1,1));
        return mix(mix(mix(n000,n100,f.x),mix(n010,n110,f.x),f.y), mix(mix(n001,n101,f.x),mix(n011,n111,f.x),f.y), f.z); }
      float ruidoDisco(float ang,float r,float escala,float semilla){ vec3 dom=vec3(cos(ang)*r*escala+semilla, sin(ang)*r*escala-semilla*0.73, r*escala*1.25+semilla*1.31); return ruidoDisco3(dom); }
      float hash1(float n){ return fract(sin(n)*43758.5453123); }
      float radioDeR01(float r01){ return mix(uRadioInterno,uRadioExterno,pow(clamp(r01,0.0,1.0),0.82)); }
      float grosorDeR01(float r01){ return mix(uGrosorInterno,uGrosorExterno,clamp(r01,0.0,1.0)); }
      float omegaRapido(float r){ float x=max(r,0.0001)/uRadioInterno; return uOmegaInterior/(x*sqrt(x)); }
      float radioMuestra(float r,float r01){ float td=min(uTiempo, T_DRIFT); return r+td*uFlujoRuido*mix(1.0,0.30,r01); }
      float hotspotsOrbitales(float angM,float r,float atenua){ float acum=0.0;
        for(int i=0;i<8;i++){ float fi=float(i); float r01c=hash1(fi*1.371+uSemillaCapa*0.13+0.113); float rc=radioDeR01(r01c);
          float angc=hash1(fi*7.137+uSemillaCapa*0.31+3.719)*6.2831853+min(uTiempo,T_SHEAR)*omegaRapido(rc)*uVelCapa;
          float dAng=mod(angM-angc+3.14159265,6.2831853)-3.14159265; float dR=(r-rc)/max(rc,0.0001);
          float sa=0.15+0.20*r01c; float sr=0.115; float gg=exp(-(dAng*dAng)/(2.0*sa*sa)-(dR*dR)/(2.0*sr*sr));
          acum+=gg*(0.38+0.62*(1.0-r01c))*(0.55+0.45*hash1(fi*3.911+1.713)); }
        return acum*atenua; }
      float mascaraAngular(float angM,float r01,float semilla){ float a=0.5+0.5*sin(angM*2.0+r01*1.0+semilla); float b=0.5+0.5*sin(angM*3.0-r01*1.0-semilla*1.7); return 0.58+0.42*(a*0.62+b*0.38); }
      float patronBrazos(float angM,float angP,float r,float semilla){ float jitter=(ruidoDisco(angM,r,0.55,semilla+91.0)-0.5)*2.20; float fase=angP*uBrazos-log(max(r,0.0001)/uRadioInterno)*uPasoEspiral+jitter; float brazo=pow(0.5+0.5*cos(fase),1.35); return mix(1.0,0.55+0.85*brazo,uAmplitudBrazo); }
      float atenuacionRadial(float r01){ return smoothstep(0.0,0.05,r01)*(1.0-smoothstep(0.90,1.0,r01)); }
      float absorcionGas(float angM,float rM,float semilla){ float n=ruidoDisco(angM,rM,0.24,semilla+31.0); float ag=smoothstep(0.18,0.82,n); return mix(0.28,1.08,ag); }
      float densidadDisco(float angM,float angP,float rM,float r01,float semilla){ float brazos=patronBrazos(angM,angP,rM,semilla);
        float nubes=ruidoDisco(angM,rM,0.42,semilla+113.0); float grumos=ruidoDisco(angM,rM,0.78,semilla+7.0); float fino=ruidoDisco(angM,rM,2.10,semilla+23.0);
        float den=(0.44+0.66*pow(brazos,1.10))*(0.40+0.94*nubes)*(0.44+0.82*grumos)*(0.80+0.26*fino)*mascaraAngular(angM,r01,semilla);
        den*=mix(1.25,0.55,smoothstep(0.0,1.0,r01)); den*=atenuacionRadial(r01); return clamp(den,0.0,2.2); }
      float densidadDiscoLite(float angM,float angP,float rM,float r01,float semilla){ float brazos=patronBrazos(angM,angP,rM,semilla);
        float nubes=ruidoDisco(angM,rM,0.42,semilla+113.0); float grumos=ruidoDisco(angM,rM,0.78,semilla+7.0);
        float den=(0.46+0.64*pow(brazos,1.10))*(0.40+0.94*nubes)*(0.42+0.84*grumos)*mascaraAngular(angM,r01,semilla);
        den*=mix(1.20,0.58,smoothstep(0.0,1.0,r01)); den*=atenuacionRadial(r01); return clamp(den,0.0,2.2); }
      float densidadNiebla(float angM,float rM,float r01,float semilla){ float nubes=ruidoDisco(angM,rM,0.30*uEscalaNiebla,semilla+113.0); float medio=ruidoDisco(angM,rM,0.68*uEscalaNiebla,semilla+137.0);
        float den=smoothstep(0.16,0.90,nubes*0.58+medio*0.62); den*=mix(1.30,0.48,smoothstep(0.0,1.0,r01)); den*=atenuacionRadial(r01); return clamp(den,0.0,1.6); }
      vec3 puntoDiscoPos(float r01,float angM,float semilla,float capa){ float r=radioDeR01(r01); float grosor=grosorDeR01(r01); float rM=radioMuestra(r,r01);
        float n=ruidoDisco(angM,rM,0.95,semilla+41.0); float n2=ruidoDisco(angM,rM,2.40,semilla+59.0);
        float y=grosor*((n*2.0-1.0)*1.9 + (n2*2.0-1.0)*0.75)*uRuidoAmp + grosor*0.60*sin(angM*3.0+r*1.6) + capa*grosor*uAlturaCapa;
        return vec3(cos(angM)*r, y, sin(angM)*r); }
      vec3 normalDiscoAprox(float angM,float r,float semilla){ float gx=0.26*sin(angM*5.0+r*2.1+semilla)*uRuidoAmp; float gz=0.26*cos(angM*4.0-r*1.7-semilla*1.4)*uRuidoAmp; return normalize(vec3(-gx,1.0,-gz)); }
      vec3 colorTermico(float r01){ float t=1.0-clamp(r01,0.0,1.0);
        vec3 col=mix(vec3(0.055,0.045,0.180), vec3(0.100,0.160,0.520), smoothstep(0.00,0.35,t));
        col=mix(col, vec3(0.160,0.340,0.860), smoothstep(0.28,0.62,t));
        col=mix(col, vec3(0.145,0.957,0.933), smoothstep(0.58,0.88,t));
        col=mix(col, vec3(0.996,0.173,0.333), smoothstep(0.90,1.00,t));
        float magenta=smoothstep(0.15,0.62,t)*(1.0-smoothstep(0.72,1.0,t));
        col=mix(col, vec3(0.557,0.424,1.0), magenta*0.22); return col; }
    `;

    const geoRejillaDisco = (function () {
      const segAng = LOOK.disk.segAng;
      const segRad = LOOK.disk.segRad;
      const cols = segAng + 1;
      const filas = segRad + 1;
      const tv = filas * cols;
      const posArr = new Float32Array(tv * 3);
      const angArr = new Float32Array(tv);
      const r01Arr = new Float32Array(tv);
      const indices = new Uint32Array(segAng * segRad * 6);
      let idx = 0;
      for (let i = 0; i < filas; i++) {
        const r01 = i / segRad;
        for (let j = 0; j < cols; j++) {
          r01Arr[idx] = r01;
          angArr[idx] = j / segAng;
          idx++;
        }
      }
      let k = 0;
      for (let i = 0; i < segRad; i++) {
        for (let j = 0; j < segAng; j++) {
          const a = i * cols + j;
          const b = i * cols + (j + 1);
          const c = (i + 1) * cols + (j + 1);
          const d = (i + 1) * cols + j;
          indices[k++] = a;
          indices[k++] = b;
          indices[k++] = d;
          indices[k++] = b;
          indices[k++] = c;
          indices[k++] = d;
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
      geo.setAttribute('aAng', new THREE.BufferAttribute(angArr, 1));
      geo.setAttribute('aR01', new THREE.BufferAttribute(r01Arr, 1));
      geo.setIndex(new THREE.BufferAttribute(indices, 1));
      geo.boundingSphere = new THREE.Sphere(
        new THREE.Vector3(0, 0, 0),
        DISCO_RADIO_EXTERNO * 1.25
      );
      return geo;
    })();

    const geoCintaDisco = (function () {
      const filas = LOOK.disk.ribbonRows;
      const tv = (filas + 1) * 2;
      const posArr = new Float32Array(tv * 3);
      const sArr = new Float32Array(tv);
      const sideArr = new Float32Array(tv);
      const indices = new Uint16Array(filas * 6);
      let idx = 0;
      let k = 0;
      for (let i = 0; i <= filas; i++) {
        const s = i / filas;
        for (let sd = 0; sd < 2; sd++) {
          sArr[idx] = s;
          sideArr[idx] = sd === 0 ? -1 : 1;
          idx++;
        }
        if (i < filas) {
          const a = i * 2;
          const b = i * 2 + 1;
          const c = (i + 1) * 2;
          const d = (i + 1) * 2 + 1;
          indices[k++] = a;
          indices[k++] = b;
          indices[k++] = c;
          indices[k++] = b;
          indices[k++] = d;
          indices[k++] = c;
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
      geo.setAttribute('aS', new THREE.BufferAttribute(sArr, 1));
      geo.setAttribute('aSide', new THREE.BufferAttribute(sideArr, 1));
      geo.setIndex(new THREE.BufferAttribute(indices, 1));
      geo.boundingSphere = new THREE.Sphere(
        new THREE.Vector3(0, 0, 0),
        DISCO_RADIO_EXTERNO * 1.25
      );
      return geo;
    })();

    const DISCO_CORRIENTES_DEF = [
      {
        r01: 0.05,
        ext: 0.32,
        paso: -0.15,
        deriva: 0.026,
        faseAng: 0.0,
        ondas: 2,
        ampOnda: 0.05,
        ancho: 0.55,
        sigma: 2.2,
        peso: 0.36,
        brillo: 0.74,
        semilla: 1.3,
        colorA: 0xdff4ff,
        colorB: 0x25f4ee,
        velNudos: 0.85,
        freqNudos: 2,
      },
      {
        r01: 0.14,
        ext: 0.44,
        paso: 0.17,
        deriva: 0.025,
        faseAng: 1.15,
        ondas: 3,
        ampOnda: 0.058,
        ancho: 0.1,
        sigma: 5.6,
        peso: 0.32,
        brillo: 0.7,
        semilla: 3.7,
        colorA: 0x9fe8ff,
        colorB: 0x25f4ee,
        velNudos: 0.78,
        freqNudos: 2,
      },
      {
        r01: 0.24,
        ext: 0.5,
        paso: 0.21,
        deriva: 0.021,
        faseAng: 3.45,
        ondas: 3,
        ampOnda: 0.062,
        ancho: 0.4,
        sigma: 2.8,
        peso: 0.24,
        brillo: 0.62,
        semilla: 9.4,
        colorA: 0xb48cff,
        colorB: 0x8f6cff,
        velNudos: 0.62,
        freqNudos: 2,
      },
      {
        r01: 0.34,
        ext: 0.42,
        paso: 0.15,
        deriva: 0.016,
        faseAng: 5.55,
        ondas: 3,
        ampOnda: 0.078,
        ancho: 0.12,
        sigma: 4.8,
        peso: 0.16,
        brillo: 0.52,
        semilla: 16.2,
        colorA: 0xff9fb8,
        colorB: 0xfe2c55,
        velNudos: 0.48,
        freqNudos: 1,
      },
      {
        r01: 0.46,
        ext: 0.36,
        paso: 0.18,
        deriva: 0.018,
        faseAng: 2.2,
        ondas: 2,
        ampOnda: 0.07,
        ancho: 0.48,
        sigma: 2.4,
        peso: 0.2,
        brillo: 0.55,
        semilla: 21.7,
        colorA: 0x8fb6ff,
        colorB: 0x25f4ee,
        velNudos: 0.55,
        freqNudos: 2,
      },
      {
        r01: 0.58,
        ext: 0.4,
        paso: 0.14,
        deriva: 0.015,
        faseAng: 4.4,
        ondas: 3,
        ampOnda: 0.066,
        ancho: 0.14,
        sigma: 5.2,
        peso: 0.14,
        brillo: 0.48,
        semilla: 27.3,
        colorA: 0x9fe8ff,
        colorB: 0x25f4ee,
        velNudos: 0.5,
        freqNudos: 1,
      },
      {
        r01: 0.7,
        ext: 0.46,
        paso: 0.16,
        deriva: 0.014,
        faseAng: 0.8,
        ondas: 2,
        ampOnda: 0.074,
        ancho: 0.36,
        sigma: 2.6,
        peso: 0.12,
        brillo: 0.44,
        semilla: 33.9,
        colorA: 0xb48cff,
        colorB: 0xfe2c55,
        velNudos: 0.44,
        freqNudos: 1,
      },
      {
        r01: 0.82,
        ext: 0.38,
        paso: 0.13,
        deriva: 0.012,
        faseAng: 3.0,
        ondas: 3,
        ampOnda: 0.08,
        ancho: 0.1,
        sigma: 4.4,
        peso: 0.1,
        brillo: 0.4,
        semilla: 40.5,
        colorA: 0xff9fb8,
        colorB: 0xfe2c55,
        velNudos: 0.4,
        freqNudos: 1,
      },
    ];

    const geoCorrientesDiscoInst = (function () {
      const base = geoCintaDisco;
      const total = DISCO_CORRIENTES_DEF.length;
      const mk = (n: number) => new Float32Array(n);
      const aParams1 = mk(total * 4);
      const aParams2 = mk(total * 4);
      const aParams3 = mk(total * 4);
      const aParams4 = mk(total * 4);
      const aColorA = mk(total * 3);
      const aColorB = mk(total * 3);
      const cA = new THREE.Color();
      const cB = new THREE.Color();

      for (let i = 0; i < total; i++) {
        const d = DISCO_CORRIENTES_DEF[i];
        cA.set(d.colorA);
        cB.set(d.colorB);
        const i4 = i * 4;
        aParams1[i4] = d.r01;
        aParams1[i4 + 1] = d.ext;
        aParams1[i4 + 2] = d.paso;
        aParams1[i4 + 3] = d.deriva;

        aParams2[i4] = d.faseAng;
        aParams2[i4 + 1] = d.ondas;
        aParams2[i4 + 2] = d.ampOnda;
        aParams2[i4 + 3] = d.ancho;

        aParams3[i4] = d.sigma;
        aParams3[i4 + 1] = d.peso;
        aParams3[i4 + 2] = d.brillo;
        aParams3[i4 + 3] = d.semilla;

        aParams4[i4] = d.velNudos;
        aParams4[i4 + 1] = d.freqNudos;
        aParams4[i4 + 2] = 0;
        aParams4[i4 + 3] = 0;

        aColorA[i * 3] = cA.r;
        aColorA[i * 3 + 1] = cA.g;
        aColorA[i * 3 + 2] = cA.b;
        aColorB[i * 3] = cB.r;
        aColorB[i * 3 + 1] = cB.g;
        aColorB[i * 3 + 2] = cB.b;
      }
      const geo = new THREE.InstancedBufferGeometry();
      geo.index = base.index;
      geo.attributes.position = base.attributes.position;
      geo.attributes.aS = base.attributes.aS;
      geo.attributes.aSide = base.attributes.aSide;
      geo.setAttribute(
        'aParams1',
        new THREE.InstancedBufferAttribute(aParams1, 4)
      );
      geo.setAttribute(
        'aParams2',
        new THREE.InstancedBufferAttribute(aParams2, 4)
      );
      geo.setAttribute(
        'aParams3',
        new THREE.InstancedBufferAttribute(aParams3, 4)
      );
      geo.setAttribute(
        'aParams4',
        new THREE.InstancedBufferAttribute(aParams4, 4)
      );
      geo.setAttribute(
        'aColorA',
        new THREE.InstancedBufferAttribute(aColorA, 3)
      );
      geo.setAttribute(
        'aColorB',
        new THREE.InstancedBufferAttribute(aColorB, 3)
      );
      geo.instanceCount = total;
      geo.boundingSphere = new THREE.Sphere(
        new THREE.Vector3(0, 0, 0),
        DISCO_RADIO_EXTERNO * 1.25
      );
      return geo;
    })();

    const geoCortinas = (function () {
      const filas = 46;
      const tv = (filas + 1) * 2;
      const posArr = new Float32Array(tv * 3);
      const sArr = new Float32Array(tv);
      const sideArr = new Float32Array(tv);
      const indices = new Uint16Array(filas * 6);
      let idx = 0;
      let k = 0;
      for (let i = 0; i <= filas; i++) {
        const s = i / filas;
        for (let sd = 0; sd < 2; sd++) {
          sArr[idx] = s;
          sideArr[idx] = sd === 0 ? -1 : 1;
          idx++;
        }
        if (i < filas) {
          const a = i * 2;
          const b = i * 2 + 1;
          const c = (i + 1) * 2;
          const d = (i + 1) * 2 + 1;
          indices[k++] = a;
          indices[k++] = b;
          indices[k++] = c;
          indices[k++] = b;
          indices[k++] = d;
          indices[k++] = c;
        }
      }
      const rl = (function (s) {
        return function () {
          s = (s * 16807) % 2147483647;
          return (s - 1) / 2147483646;
        };
      })(55123);
      const ti = LOOK.disk.curtains * 2;
      const aCortinaParams = new Float32Array(ti * 4);
      const aVel = new Float32Array(ti);
      const aColorA = new Float32Array(ti * 3);
      const aColorB = new Float32Array(ti * 3);
      const colA = new THREE.Color(TIK_CYAN);
      const colB = new THREE.Color(TIK_PINK);
      let n = 0;
      for (const signo of [1, -1]) {
        for (let i = 0; i < LOOK.disk.curtains; i++) {
          const n4 = n * 4;
          aCortinaParams[n4] = signo;
          aCortinaParams[n4 + 1] =
            (i / LOOK.disk.curtains) * DOS_PI + rl() * 0.55;
          aCortinaParams[n4 + 2] = 0.2 + rl() * 0.2;
          aCortinaParams[n4 + 3] = rl() * 100;
          aVel[n] = 0.34 + rl() * 0.3;
          aColorA[n * 3] = colA.r;
          aColorA[n * 3 + 1] = colA.g;
          aColorA[n * 3 + 2] = colA.b;
          aColorB[n * 3] = colB.r;
          aColorB[n * 3 + 1] = colB.g;
          aColorB[n * 3 + 2] = colB.b;
          n++;
        }
      }
      const geo = new THREE.InstancedBufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
      geo.setAttribute('aS', new THREE.BufferAttribute(sArr, 1));
      geo.setAttribute('aSide', new THREE.BufferAttribute(sideArr, 1));
      geo.setIndex(new THREE.BufferAttribute(indices, 1));
      geo.setAttribute(
        'aCortinaParams',
        new THREE.InstancedBufferAttribute(aCortinaParams, 4)
      );
      geo.setAttribute('aVel', new THREE.InstancedBufferAttribute(aVel, 1));
      geo.setAttribute(
        'aColorA',
        new THREE.InstancedBufferAttribute(aColorA, 3)
      );
      geo.setAttribute(
        'aColorB',
        new THREE.InstancedBufferAttribute(aColorB, 3)
      );
      geo.instanceCount = ti;
      geo.boundingSphere = new THREE.Sphere(
        new THREE.Vector3(0, 0, 0),
        DISCO_RADIO_EXTERNO * 1.25
      );
      return geo;
    })();

    const DIR_POLO_NORTE = new THREE.Vector3(
      -Math.sin(INCLINACION_MAGNETICA),
      Math.cos(INCLINACION_MAGNETICA),
      0
    ).normalize();

    function uniformesDisco(extra: Record<string, any>) {
      return Object.assign(
        {
          uTiempo: U_GLOBAL.tiempo,
          uSobretension: U_GLOBAL.sobretension,
          uPulso: U_GLOBAL.pulso,
          uRadioInterno: { value: DISCO_RADIO_INTERNO },
          uRadioExterno: { value: DISCO_RADIO_EXTERNO },
          uGrosorInterno: { value: DISCO_GROSOR_INTERNO },
          uGrosorExterno: { value: DISCO_GROSOR_EXTERNO },
          uOmegaInterior: { value: LOOK.disk.omegaInner },
          uBrazos: { value: LOOK.disk.arms },
          uPasoEspiral: { value: LOOK.disk.spiralPitch },
          uVelOnda: { value: LOOK.disk.waveSpeed },
          uAmplitudBrazo: { value: LOOK.disk.armStrength },
          uRuidoAmp: { value: LOOK.disk.turbulence },
          uAlturaCapa: { value: 0.85 },
          uSemillaCapa: { value: 5.1 },
          uVelCapa: { value: 1.0 },
          uFlujoRadial: { value: LOOK.disk.radialFlow },
          uFlujoRuido: { value: LOOK.disk.noiseDrift },
          uEscalaNiebla: { value: 1.0 },
          uCapa: { value: 0.0 },
          uModoNiebla: { value: 0.0 },
        },
        extra
      );
    }

    const VERT_DISCO_BASE = `
      attribute float aAng; attribute float aR01;
      varying float vR01; varying float vDensidad; varying float vHotspot; varying float vBordeInterno; varying float vModulacion; varying float vAbsorcion; varying vec3 vNormal; varying vec3 vVista; varying float vDoppler;
      ${GLSL_DISCO}
      void main(){
        float r01=clamp(aR01,0.0,1.0); float r=radioDeR01(r01);
        float tShear=min(uTiempo, T_SHEAR);
        float angM=aAng*6.28318530718 + (omegaRapido(r)-omegaRapido(uRadioExterno))*tShear + uTiempo*GIRO_RIGIDO;
        float angP=aAng*6.28318530718 + uTiempo*GIRO_RIGIDO;
        vec3 pd=puntoDiscoPos(r01, angM, uSemillaCapa, uCapa);
        vec4 mundo=modelMatrix*vec4(pd,1.0);
        vec3 nL=normalDiscoAprox(angM, r, uSemillaCapa);
        vNormal=normalize((modelMatrix*vec4(nL,0.0)).xyz);
        vVista=normalize(cameraPosition-mundo.xyz);
        vec3 tang=normalize(vec3(-sin(angM),0.0,cos(angM)));
        vec3 tangM=normalize((modelMatrix*vec4(tang,0.0)).xyz);
        vec3 vistaM=normalize(cameraPosition-mundo.xyz);
        float acerc=dot(tangM,vistaM);
        vDoppler=pow(clamp(0.72+acerc*0.42,0.25,1.45),2.2);
        float bordes=atenuacionRadial(r01);
        float rM=radioMuestra(r,r01);
        vR01=r01;
        if(uModoNiebla>0.5){ vDensidad=densidadNiebla(angM,rM,r01,uSemillaCapa); vHotspot=hotspotsOrbitales(angM,r,bordes)*0.40; }
        else { vDensidad=densidadDisco(angM,angP,rM,r01,uSemillaCapa); vHotspot=hotspotsOrbitales(angM,r,bordes); }
        vAbsorcion=absorcionGas(angM,rM,uSemillaCapa);
        float gi=(r01-0.006)/0.030; vBordeInterno=exp(-gi*gi);
        vModulacion=0.82+0.18*sin(angM*4.0+r*1.9)*sin(angM*2.0-r*3.3);
        gl_Position=projectionMatrix*viewMatrix*mundo;
      }`;

    const FRAG_MASA = `
      precision highp float; uniform float uOpacidadMasa;
      varying float vR01; varying float vDensidad; varying float vHotspot; varying float vBordeInterno; varying float vModulacion; varying float vAbsorcion; varying vec3 vNormal; varying vec3 vVista; varying float vDoppler;
      ${GLSL_DISCO}
      void main(){
        float den=(vDensidad+vHotspot*0.85)*vAbsorcion;
        float fade=smoothstep(0.0,0.02,den);
        float fres=1.0-abs(dot(normalize(vNormal),normalize(vVista)));
        float borde=pow(fres,1.60);
        float dopMasa=mix(0.90,1.12,clamp(vDoppler*0.45,0.0,1.0));
        vec3 col=colorTermico(vR01)*(0.15+0.30*den)*vModulacion;
        col+=vec3(0.145,0.957,0.933)*vBordeInterno*den*0.16;
        col+=vec3(0.030,0.060,0.110)*uSobretension*den;
        float grosorLocal=mix(uGrosorInterno,uGrosorExterno,vR01);
        float pesoGrosor=clamp(grosorLocal/max(uGrosorExterno,0.0001),0.0,1.0);
        float alfa=uOpacidadMasa*den*vModulacion*dopMasa*(0.16+0.34*smoothstep(0.0,0.55,1.0-vR01))*(0.55+0.45*pesoGrosor)*(0.90+0.10*borde);
        gl_FragColor=vec4(col, clamp(alfa*fade,0.0,0.62));
      }`;

    const FRAG_NIEBLA = `
      precision highp float; uniform float uBrilloNiebla;
      varying float vR01; varying float vDensidad; varying float vHotspot; varying float vBordeInterno; varying float vModulacion; varying float vAbsorcion; varying vec3 vNormal; varying vec3 vVista; varying float vDoppler;
      ${GLSL_DISCO}
      void main(){
        float den=(vDensidad+vHotspot*0.55)*vAbsorcion;
        float fade=smoothstep(0.0,0.02,den);
        float t=1.0-vR01;
        float dopNiebla=mix(0.70,1.35,clamp(vDoppler*0.45,0.0,1.0));
        float emision=den*(0.16+0.50*pow(t,1.65))*vModulacion*dopNiebla*(1.0+uSobretension*0.20);
        vec3 col=colorTermico(vR01)*emision*0.90;
        col+=vec3(0.145,0.957,0.933)*vBordeInterno*den*0.14;
        gl_FragColor=vec4(col*uBrilloNiebla, clamp(emision*uBrilloNiebla*0.60*fade,0.0,0.35));
      }`;

    const FRAG_EMISION = `
      precision highp float; uniform float uBrilloEmision;
      varying float vR01; varying float vDensidad; varying float vHotspot; varying float vBordeInterno; varying float vModulacion; varying float vAbsorcion; varying vec3 vNormal; varying vec3 vVista; varying float vDoppler;
      ${GLSL_DISCO}
      void main(){
        float den=vDensidad; float hot=vHotspot;
        float fade=smoothstep(0.0,0.02,den+hot);
        float t=1.0-vR01;
        float termica=smoothstep(0.0,0.55,t)*0.95+0.08;
        float choqueInterno=smoothstep(0.55,1.0,vBordeInterno)*1.1;
        float hotspots=hot*(0.34+1.05*pow(t,1.6));
        float doppler=mix(0.55,1.75,clamp(vDoppler,0.0,1.6));
        float emision=(den*termica + choqueInterno*den*1.4 + hotspots)*vModulacion*vAbsorcion*doppler*(1.0+uSobretension*0.20+uPulso*0.08);
        vec3 col=colorTermico(vR01)*emision;
        col+=vec3(0.145,0.957,0.933)*choqueInterno*den*0.45;
        col+=vec3(0.996,0.173,0.333)*choqueInterno*den*0.22;
        float blanco=vBordeInterno*den*0.15 + hotspots*pow(t,3.0)*0.15;
        col += mix(colorTermico(vR01), vec3(1.0), 0.35) * clamp(blanco,0.0,0.55);
        gl_FragColor=vec4(col*uBrilloEmision, clamp(emision*uBrilloEmision*0.80*fade,0.0,0.85));
      }`;

    const FRAG_CORRIENTES = `
      precision highp float; uniform float uSobretension; uniform float uOpacidadGlobal;
      varying vec4 vA; varying vec4 vB; varying vec3 vColorA; varying vec3 vColorB;
      void main(){
        float lat=abs(vA.x); float faseNudo=vA.y; float den=vA.z; float termica=vA.w;
        float fade=smoothstep(0.0,0.02,den);
        float sigma=vB.x; float peso=vB.y; float brillo=vB.z; float arcoBrillo=vB.w;
        float core = exp(-lat*lat*sigma);
        float halo = exp(-lat*lat*sigma*0.16);
        float densidad = core*0.65 + halo*0.50;
        float nodo=pow(max(0.0,1.0-abs(faseNudo-0.5)*2.0),1.7);
        float energia=(0.08+nodo*0.48+pow(termica,2.6)*0.36+uSobretension*0.12)*densidad*den*arcoBrillo*peso*uOpacidadGlobal;
        vec3 col=mix(vColorB,vColorA, nodo*0.46+pow(termica,2.6)*0.38);
        col+=vec3(0.145,0.957,0.933)*pow(densidad,2.8)*nodo*pow(termica,2.2)*0.25;
        gl_FragColor=vec4(col*energia*brillo*0.64, clamp(energia*brillo*0.90*fade,0.0,0.90));
      }`;

    const VERT_CORRIENTES = `
      attribute float aS; attribute float aSide;
      attribute vec4 aParams1; attribute vec4 aParams2; attribute vec4 aParams3; attribute vec4 aParams4;
      attribute vec3 aColorA; attribute vec3 aColorB;
      varying vec4 vA; varying vec4 vB; varying vec3 vColorA; varying vec3 vColorB;
      ${GLSL_DISCO}
      void main(){
        float aR01 = aParams1.x; float aExtension = aParams1.y; float aPasoRadial = aParams1.z; float aDeriva = aParams1.w;
        float aFaseAng = aParams2.x; float aOndas = aParams2.y; float aAmpOnda = aParams2.z; float aAncho = aParams2.w;
        float aSigma = aParams3.x; float aPeso = aParams3.y; float aBrillo = aParams3.z; float aSemilla = aParams3.w;
        float aVelNudos = aParams4.x; float aFreqNudos = aParams4.y;
        float ciclo=fract(aR01 - uTiempo*aDeriva*uFlujoRadial*6.0);
        float r01C=clamp(ciclo,0.02,0.98);
        float sL=aS-0.5;
        float r01L=clamp(r01C + sL*aPasoRadial, 0.005, 0.995);
        float forma=1.0 + aAmpOnda*sin(sL*aOndas*6.2831853 + aSemilla*6.0) + aAmpOnda*0.38*sin(sL*aOndas*13.0 - aSemilla*3.0);
        float rC=radioDeR01(r01C);
        float r=radioDeR01(r01L)*forma;
        float rM=radioMuestra(r,r01L);
        float tShearC=min(uTiempo, T_SHEAR);
        float ang=aFaseAng + sL*aExtension*6.2831853 + (omegaRapido(rC)-omegaRapido(uRadioExterno))*tShearC + uTiempo*GIRO_RIGIDO;
        float angP=aFaseAng + sL*aExtension*6.2831853 + uTiempo*GIRO_RIGIDO;
        float grosor=grosorDeR01(r01L);
        float y=grosor*(sin(sL*7.0+aSemilla*4.0)*0.85 + sin(sL*13.0-aSemilla*2.0)*0.30)*uRuidoAmp;
        vec3 p=vec3(cos(ang)*r, y, sin(ang)*r);
        vec3 radial=vec3(cos(ang),0.0,sin(ang));
        vec4 mundo=modelMatrix*vec4(p,1.0);
        float bordes=atenuacionRadial(r01L);
        float den=densidadDiscoLite(ang,angP,rM,r01L,aSemilla);
        float hot=hotspotsOrbitales(ang,r,bordes);
        float absorcion=absorcionGas(ang,rM,aSemilla);
        float envArco=pow(sin(clamp(aS,0.0,1.0)*3.14159265),0.60);
        float envCiclo=pow(sin(ciclo*3.14159265),0.55);
        float arcoBrillo=0.40+0.60*pow(0.5+0.5*sin(sL*aOndas*2.0+aSemilla*5.0),1.7);
        vA=vec4(aSide, fract(aS*aFreqNudos - uTiempo*aVelNudos + aSemilla*0.271), (den+hot*0.95)*envCiclo*envArco*absorcion, 1.0-r01L);
        vB=vec4(aSigma,aPeso,aBrillo,arcoBrillo);
        vColorA=aColorA; vColorB=aColorB;
        float thickVar = 0.45 + 1.10 * (0.5+0.5*sin(sL*aOndas*3.0 + aSemilla*7.0));
        float ancho=aAncho * thickVar * (0.6+0.55*den)*(0.58+0.42*(1.0-r01L));
        vec3 posM=mundo.xyz + (modelMatrix*vec4(radial*(aSide*ancho),0.0)).xyz;
        gl_Position=projectionMatrix*viewMatrix*vec4(posM,1.0);
      }`;

    const VERT_CORTINAS = `
      attribute float aS; attribute float aSide;
      attribute vec4 aCortinaParams; attribute float aVel;
      attribute vec3 aColorA; attribute vec3 aColorB;
      uniform float uRadioEstrella; uniform vec3 uDirPolo;
      varying vec4 vA; varying vec3 vColorFrio;
      ${GLSL_DISCO}
      void main(){
        float aSigno = aCortinaParams.x;
        float aAzimut = aCortinaParams.y;
        float aAncho = aCortinaParams.z;
        float aSemilla = aCortinaParams.w;
        float s=clamp(aS,0.0,1.0);
        float radio=uRadioInterno*pow(1.0-s,1.32)*(1.0+0.10*sin(s*9.0+aSemilla*5.0+uTiempo*0.6));
        float altura=uRadioEstrella*pow(s,0.76)*aSigno;
        float ang=mix(aAzimut,(aSigno>0.0)?3.14159265:0.0, pow(s,1.15)) + sin(s*4.0+uTiempo*0.3+aSemilla)*0.06;
        vec3 p=vec3(cos(ang)*radio, altura, sin(ang)*radio);
        vec3 puntoPolo=uDirPolo*uRadioEstrella*aSigno;
        p=mix(p,puntoPolo,smoothstep(0.80,1.0,s));
        vec3 dirAz=vec3(-sin(ang),0.0,cos(ang));
        float ancho=aAncho*(1.0-0.78*pow(s,0.85))*(0.75+0.25*sin(s*13.0-uTiempo*1.4+aSemilla));
        p+=dirAz*(aSide*ancho);
        float faseBanda=fract(s*2.4-uTiempo*aVel+aSemilla*0.19);
        float bandas=pow(max(0.0,1.0-abs(faseBanda-0.5)*2.0),2.4);
        vA=vec4(aSide,s,bandas,0.55+0.45*sin(s*5.0+aSemilla*3.0-uTiempo*0.4));
        vColorFrio=vec3(0.145,0.957,0.933);
        gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
      }`;

    const FRAG_CORTINAS = `
      precision highp float; uniform float uPulso; uniform float uSobretension; uniform float uBrillo;
      varying vec4 vA; varying vec3 vColorFrio;
      void main(){
        float lat=abs(vA.x); float s=vA.y; float bandas=vA.z; float arco=vA.w;
        float densidad=exp(-lat*lat*6.0);
        float arranque=smoothstep(0.0,0.16,s); float cierre=1.0-smoothstep(0.88,1.0,s);
        float energia=(0.055+bandas*0.66+uPulso*0.30+uSobretension*0.13)*densidad*arranque*cierre*arco;
        vec3 col=mix(vColorFrio, vec3(0.60,0.85,1.0), pow(densidad,1.6)*(0.30+bandas*0.55));
        gl_FragColor=vec4(col*energia*uBrillo, clamp(energia*1.22,0.0,1.0));
      }`;

    const uniMasa = uniformesDisco({
      uCapa: { value: 0.0 },
      uAlturaCapa: { value: 0.85 },
      uSemillaCapa: { value: 5.1 },
      uVelCapa: { value: 1.0 },
      uModoNiebla: { value: 0.0 },
      uOpacidadMasa: { value: LOOK.disk.massOpacity },
    });
    const matMasa = new THREE.ShaderMaterial({
      uniforms: uniMasa,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      vertexShader: VERT_DISCO_BASE,
      fragmentShader: FRAG_MASA,
    });
    const discoMasa = new THREE.Mesh(geoRejillaDisco, matMasa);
    discoMasa.frustumCulled = false;
    discoMasa.layers.set(CAPA_BASE);
    discoMasa.renderOrder = 4;
    grupoDisco.add(discoMasa);

    const laminasNiebla: { uni: any; cfg: any }[] = [];
    for (const cfg of CAPAS_GAS) {
      const uni = uniformesDisco({
        uCapa: { value: cfg.capa },
        uAlturaCapa: { value: LOOK.disk.fogHeight },
        uSemillaCapa: { value: cfg.semilla },
        uVelCapa: { value: cfg.vel },
        uEscalaNiebla: { value: cfg.escala },
        uModoNiebla: { value: 1.0 },
        uBrilloNiebla: { value: cfg.brillo * LOOK.disk.fogBrightness },
      });
      const mat = new THREE.ShaderMaterial({
        uniforms: uni,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        vertexShader: VERT_DISCO_BASE,
        fragmentShader: FRAG_NIEBLA,
      });
      const lam = new THREE.Mesh(geoRejillaDisco, mat);
      lam.frustumCulled = false;
      lam.layers.set(CAPA_BASE);
      lam.renderOrder = cfg.capa < 0 ? 5 : 7;
      grupoDisco.add(lam);
      laminasNiebla.push({ uni, cfg });
    }

    const uniEmision = uniformesDisco({
      uCapa: { value: 0.0 },
      uAlturaCapa: { value: 0.85 },
      uSemillaCapa: { value: 5.1 },
      uVelCapa: { value: 1.0 },
      uModoNiebla: { value: 0.0 },
      uBrilloEmision: { value: LOOK.disk.emissionBrightness },
    });
    const matEmision = new THREE.ShaderMaterial({
      uniforms: uniEmision,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      vertexShader: VERT_DISCO_BASE,
      fragmentShader: FRAG_EMISION,
    });
    const discoEmision = new THREE.Mesh(geoRejillaDisco, matEmision);
    discoEmision.frustumCulled = false;
    marcarBloom(discoEmision);
    discoEmision.renderOrder = 8;
    grupoDisco.add(discoEmision);

    const uniCorrientes = uniformesDisco({
      uOpacidadGlobal: { value: LOOK.disk.currentsOpacity },
    });
    const matCorrientes = new THREE.ShaderMaterial({
      uniforms: uniCorrientes,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      vertexShader: VERT_CORRIENTES,
      fragmentShader: FRAG_CORRIENTES,
    });
    const corrientes = new THREE.Mesh(geoCorrientesDiscoInst, matCorrientes);
    corrientes.frustumCulled = false;
    marcarBloom(corrientes);
    corrientes.renderOrder = 9;
    grupoDisco.add(corrientes);

    const uniCortinas = uniformesDisco({
      uRadioEstrella: { value: RADIO * 0.995 },
      uDirPolo: { value: DIR_POLO_NORTE },
      uBrillo: { value: LOOK.disk.curtainsBrightness },
    });
    const matCortinas = new THREE.ShaderMaterial({
      uniforms: uniCortinas,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      vertexShader: VERT_CORTINAS,
      fragmentShader: FRAG_CORTINAS,
    });
    const cortinas = new THREE.Mesh(geoCortinas, matCortinas);
    cortinas.frustumCulled = false;
    marcarBloom(cortinas);
    cortinas.renderOrder = 12;
    grupoDisco.add(cortinas);

    /* ===================== CHORROS DE PLASMA (JETS) ===================== */
    const TUBE_VERT = `
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){
        vUv = uv;
        vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`;

    function crearTubo(
      signo: number,
      radioTop: number,
      radioBot: number,
      esCore: boolean
    ) {
      const geo = new THREE.CylinderGeometry(
        radioTop,
        radioBot,
        JET_LARGO,
        24,
        1,
        true
      );
      const uni = {
        uTiempo: U_GLOBAL.tiempo,
        uPulso: U_GLOBAL.pulso,
        uBrillo: { value: LOOK.jets.brightness },
        uFlowSpeed: { value: LOOK.jets.flowSpeed },
        uCore: { value: esCore ? 1.0 : 0.0 },
        uColorPlasma: {
          value:
            signo > 0
              ? new THREE.Color(TIK_CYAN)
              : new THREE.Color(TIK_PINK),
        },
        uColorNucleo: {
          value:
            signo > 0
              ? new THREE.Color(TIK_CYAN_CLARO)
              : new THREE.Color(TIK_PINK_CLARO),
        },
      };
      const mat = new THREE.ShaderMaterial({
        uniforms: uni,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        vertexShader: TUBE_VERT,
        fragmentShader: `
          precision highp float;
          uniform float uTiempo; uniform float uPulso; uniform float uBrillo; uniform float uFlowSpeed; uniform float uCore;
          uniform vec3 uColorPlasma; uniform vec3 uColorNucleo;
          varying vec2 vUv; varying vec3 vN; varying vec3 vV;
          void main(){
            float edge = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.5);
            float cuerpo = 1.0 - 0.55*edge;
            float flow = 0.75 + 0.25*sin(vUv.y*20.0 - uTiempo*uFlowSpeed);
            float topFade  = 1.0 - smoothstep(0.55, 1.0, vUv.y);
            float baseFade = smoothstep(0.0, 0.05, vUv.y);
            float pulso = 1.0;
            float e;
            vec3 color;
            if (uCore > 0.5) {
              e = (0.9 + 0.4*flow) * topFade * baseFade * pulso;
              color = uColorNucleo;
            } else {
              e = (0.30 + 0.30*flow) * cuerpo * topFade * baseFade * pulso;
              color = mix(uColorPlasma, uColorNucleo, edge);
            }
            e *= uBrillo;
            gl_FragColor = vec4(color*e, clamp(e,0.0,1.0));
          }`,
      });
      const m = new THREE.Mesh(geo, mat);
      m.position.y = signo * (RADIO * 0.5 + JET_LARGO / 2);
      if (signo < 0) m.rotation.x = Math.PI;
      marcarBloom(m);
      m.renderOrder = 14;
      grupoEje.add(m);
      return { mesh: m, mat: uni };
    }

    crearTubo(1, 0.32, 0.46, false);
    crearTubo(1, 0.18, 0.23, true);
    crearTubo(-1, 0.32, 0.46, false);
    crearTubo(-1, 0.18, 0.23, true);

    function crearBaseGlow(signo: number) {
      const m = new THREE.SpriteMaterial({
        map: texAura,
        color: signo > 0 ? TIK_CYAN : TIK_PINK,
        transparent: true,
        opacity: 0.22,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
      });
      const s = new THREE.Sprite(m);
      s.scale.set(0.9, 1.8, 1);
      s.position.y = signo * (RADIO * 1.1);
      marcarBloom(s);
      s.renderOrder = 13;
      grupoEje.add(s);
      return { sprite: s, material: m };
    }
    const baseGlowN = crearBaseGlow(1);
    const baseGlowS = crearBaseGlow(-1);

    escena.add(new THREE.AmbientLight(0x2a3356, 1.0));
    const luzPrincipal = new THREE.DirectionalLight(0xffffff, 2.2);
    luzPrincipal.position.set(4, 5, 6);
    escena.add(luzPrincipal);
    const luzRosa = new THREE.PointLight(TIK_PINK, 45, 30);
    luzRosa.position.set(-5, -2, 3);
    escena.add(luzRosa);
    const luzAzul = new THREE.PointLight(TIK_CYAN, 40, 30);
    luzAzul.position.set(5, -3, -4);
    escena.add(luzAzul);

    // ==========================================
    // POSTPROCESADO (Bloom y Composición)
    // ==========================================
    const anchoInicial = Math.max(2, Math.floor(getWidth() * DPR_MAX));
    const altoInicial = Math.max(2, Math.floor(getHeight() * DPR_MAX));
    const rtFinal = new THREE.WebGLRenderTarget(anchoInicial, altoInicial, {
      type: THREE.HalfFloatType,
      samples: LOOK.post.msaa,
    });
    const paseRender = new RenderPass(escena, camara);
    const paseBloom = new UnrealBloomPass(
      new THREE.Vector2(anchoInicial, altoInicial),
      LOOK.post.bloom,
      LOOK.post.bloomRadius,
      LOOK.post.bloomThreshold
    );
    const composerBloom = new EffectComposer(renderer);
    composerBloom.renderToScreen = false;
    composerBloom.addPass(paseRender);
    composerBloom.addPass(paseBloom);
    const ESCALA_BLOOM = 0.5;
    const bloomSetSizeOriginal = paseBloom.setSize.bind(paseBloom);
    paseBloom.setSize = function (w: number, h: number) {
      bloomSetSizeOriginal(
        Math.max(32, Math.round(w * ESCALA_BLOOM)),
        Math.max(32, Math.round(h * ESCALA_BLOOM))
      );
    };

    // Shader de mezcla: fondo negro puro con desenfoque de campo (DoF bokeh) en borde inferior izquierdo
    const ShaderMezcla = {
      uniforms: {
        baseTexture: { value: null },
        bloomTexture: { value: null },
        uIntensidadBloom: { value: LOOK.post.bloomScale },
        uAspect: { value: getWidth() / getHeight() },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `precision highp float;
        uniform sampler2D baseTexture;
        uniform sampler2D bloomTexture;
        uniform float uIntensidadBloom;
        uniform float uAspect;
        varying vec2 vUv;

        void main(){
          vec4 base = texture2D(baseTexture, vUv);
          vec4 bloom = texture2D(bloomTexture, vUv);

          // Desenfoque óptico de profundidad de campo enfocado en las esquinas y borde izquierdo inferior
          // En vUv: (0,0) es la esquina inferior izquierda
          float cx = clamp(vUv.x / 0.65, 0.0, 1.0);
          float cy = clamp(vUv.y / 0.58, 0.0, 1.0);
          float dofMask = (1.0 - smoothstep(0.0, 1.0, cx)) * (1.0 - smoothstep(0.0, 1.0, cy));
          dofMask = pow(dofMask, 0.65);

          if (dofMask > 0.01) {
            float blurRad = 0.026 * dofMask;
            vec4 accumBase = vec4(0.0);
            vec4 accumBloom = vec4(0.0);
            float totalW = 0.0;

            const int TAPS = 16;
            for (int i = 0; i < TAPS; i++) {
              float fi = float(i);
              float ang = fi * 2.39996323;
              float r = sqrt((fi + 0.5) / float(TAPS)) * blurRad;
              vec2 offset = vec2(cos(ang), sin(ang) * uAspect) * r;

              // Dispersión cromática óptica periférica realista
              vec2 uvR = vUv + offset * 1.035;
              vec2 uvG = vUv + offset;
              vec2 uvB = vUv + offset * 0.965;

              float rVal = texture2D(baseTexture, uvR).r;
              float gVal = texture2D(baseTexture, uvG).g;
              float bVal = texture2D(baseTexture, uvB).b;
              float aVal = texture2D(baseTexture, uvG).a;

              vec4 sBloom = texture2D(bloomTexture, uvG);

              float w = 1.0 - (r / (blurRad + 0.0001)) * 0.28;
              accumBase += vec4(rVal, gVal, bVal, aVal) * w;
              accumBloom += sBloom * w;
              totalW += w;
            }

            vec4 blurredBase = accumBase / totalW;
            vec4 blurredBloom = accumBloom / totalW;

            base = mix(base, blurredBase, dofMask);
            bloom = mix(bloom, blurredBloom, dofMask);
          }

          gl_FragColor = vec4(base.rgb + bloom.rgb * uIntensidadBloom, 1.0);
        }`,
    };
    const paseMezcla = new ShaderPass(
      new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.clone(ShaderMezcla.uniforms),
        vertexShader: ShaderMezcla.vertexShader,
        fragmentShader: ShaderMezcla.fragmentShader,
      }),
      'baseTexture'
    );
    paseMezcla.needsSwap = true;
    paseMezcla.material.uniforms.bloomTexture.value =
      composerBloom.renderTarget2.texture;
    const paseSalida = new OutputPass();
    const composerFinal = new EffectComposer(renderer, rtFinal);
    composerFinal.addPass(paseRender);
    composerFinal.addPass(paseMezcla);
    composerFinal.addPass(paseSalida);

    const materialNegroOpaco = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: false,
      depthWrite: true,
    });
    const registrosBase = [
      {
        objeto: discoMasa,
        tipo: 'ocultar',
        materialOriginal: discoMasa.material,
        visibleOriginal: true,
      },
    ];

    function prepararPaseBloom() {
      for (const r of registrosBase) {
        if (r.tipo === 'opaco') (r.objeto as any).material = materialNegroOpaco;
        else r.objeto.visible = false;
      }
    }

    function restaurarPaseBloom() {
      for (const r of registrosBase) {
        if (r.tipo === 'opaco') (r.objeto as any).material = r.materialOriginal;
        else r.objeto.visible = r.visibleOriginal;
      }
    }

    function redimensionarComposers(
      ancho: number,
      alto: number,
      pixelRatio: number
    ) {
      composerBloom.setPixelRatio(pixelRatio);
      composerBloom.setSize(ancho, alto);
      composerFinal.setPixelRatio(pixelRatio);
      composerFinal.setSize(ancho, alto);
      if (paseMezcla?.material?.uniforms?.uAspect) {
        paseMezcla.material.uniforms.uAspect.value = ancho / Math.max(alto, 1);
      }
    }
    redimensionarComposers(getWidth(), getHeight(), DPR_MAX);

    ajustarCamara();

    // ==========================================
    // BUCLE DE ANIMACIÓN CONTINUO
    // (Automático, sin intervención del usuario)
    // ==========================================
    const reloj = new THREE.Clock();

    function animar() {
      animId = requestAnimationFrame(animar);
      const tiempo = reloj.getElapsedTime();

      // Rotación autónoma y continua del disco de acreción
      grupoDisco.rotation.y = tiempo * LOOK.disk.giroGrupo;

      // Pulsación natural y suave del halo
      const pulsoEscala = 1 + Math.sin(tiempo * 1.1) * 0.016;
      grupoEsfera.scale.setScalar(pulsoEscala);

      const onda = Math.sin(tiempo * 0.62);
      const sobretensionPico = Math.pow(Math.max(0, onda), 14.0) * 1.4;
      const sobretensionSuave = 0.3 + 0.3 * Math.sin(tiempo * 0.62);

      const pulsoGlobal = calcularPulso(tiempo, JET_DESFASE);
      const flash = pulsoGlobal.pulso;
      const fase = pulsoGlobal.fase;

      // Actualizar uniformes globales
      U_GLOBAL.tiempo.value = tiempo;
      U_GLOBAL.sobretension.value = sobretensionSuave;
      U_GLOBAL.pulso.value = flash;
      U_GLOBAL.fasePulso.value = fase;

      // Actualizar uniformes del cielo de estrellas
      uniformesEstrellas.uTiempo.value = tiempo;

      // Descargas de malla y nodos
      uniformesMalla.uTiempo.value = tiempo;
      uniformesMalla.uSobretension.value = sobretensionPico;
      uniformesNodos.uTiempo.value = tiempo;
      halo.material.opacity = 0.05 + sobretensionPico * 0.04;

      baseGlowN.material.opacity = 0.22;
      baseGlowS.material.opacity = 0.22;

      // Respiración del gas
      const respiracionDisco = 0.94 + 0.06 * Math.sin(tiempo * 0.21);
      uniMasa.uOpacidadMasa.value = LOOK.disk.massOpacity * respiracionDisco;
      uniEmision.uBrilloEmision.value =
        LOOK.disk.emissionBrightness *
        (1.03 - 0.03 * respiracionDisco) *
        (1.0 + flash * 0.06);

      for (const lamina of laminasNiebla) {
        lamina.uni.uBrilloNiebla.value =
          lamina.cfg.brillo *
          LOOK.disk.fogBrightness *
          (1.05 - 0.05 * respiracionDisco);
      }

      paseBloom.strength = LOOK.post.bloom;

      // Luces de órbita
      luzRosa.position.x = Math.sin(tiempo * 0.6) * 5;
      luzRosa.position.z = Math.cos(tiempo * 0.6) * 5;
      luzAzul.position.x = Math.cos(tiempo * 0.45) * 5;
      luzAzul.position.z = Math.sin(tiempo * 0.45) * -5;

      // Renderizado de dos pasadas (Bloom + Composición final)
      prepararPaseBloom();
      composerBloom.render();
      restaurarPaseBloom();
      composerFinal.render();
    }
    animar();

    let temporizadorResize: number;
    const handleResize = () => {
      clearTimeout(temporizadorResize);
      temporizadorResize = window.setTimeout(() => {
        const w = getWidth();
        const h = getHeight();
        ajustarCamara();
        renderer.setSize(w, h);
        redimensionarComposers(w, h, renderer.getPixelRatio());
        uniformesNodos.uPixelRatio.value = renderer.getPixelRatio();
        uniformesEstrellas.uPixelRatio.value = renderer.getPixelRatio();
      }, 90);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      geoEstrellas.dispose();
      matEstrellas.dispose();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="pulsar-container absolute inset-0 w-full h-full pointer-events-none overflow-hidden z-0 bg-black"
    >
      <canvas
        ref={canvasRef}
        id="escena"
        className="block w-full h-full pointer-events-none select-none"
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
    </div>
  );
};
