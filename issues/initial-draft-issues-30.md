# Initial Draft Issues (30)

아래 30개 항목은 `AI WebGPU Lab — Master` 프로젝트의 초기 draft issue 후보입니다.

## 공통 인프라 / 운영
1. [infra] 공통 결과 스키마와 validation 스크립트 추가  
   - 저장소: `shared-bench-schema`
   - Priority: P0
   - Done: 스키마 추가, validation 스크립트 추가, 샘플 결과 2개 이상 검증 통과

2. [infra] WebGPU capability 수집 유틸 구현  
   - 저장소: `shared-webgpu-capability`
   - Priority: P0
   - Done: adapter info, feature/limits 정규화, 실패 사유 코드화

3. [infra] 실험 저장소 공통 템플릿 정리  
   - 저장소: `.github`
   - Priority: P0
   - Done: 이슈 템플릿, PR 템플릿, `RESULTS.md` 템플릿 추가

4. [infra] GitHub Actions 기본 CI 구축  
   - 저장소: `shared-github-actions`
   - Priority: P1
   - Done: reusable workflow 작성, 2개 이상 저장소 적용

5. [docs] 조직 운영 규칙과 분기 리듬 문서화  
   - 저장소: `docs-lab-roadmap`
   - Priority: P1
   - Done: weekly/monthly/quarterly ritual 정의, promote/continue/archive 기준 추가

## 그래픽스 / 블랙홀
6. [exp] three.js WebGPU core baseline scene 구현  
   - 저장소: `exp-three-webgpu-core`
   - Priority: P1

7. [exp] Babylon.js WebGPU core baseline scene 구현  
   - 저장소: `exp-babylon-webgpu-core`
   - Priority: P1

8. [exp] PlayCanvas WebGPU core scene 및 워크플로우 기록  
   - 저장소: `exp-playcanvas-webgpu-core`
   - Priority: P1

9. [exp] three.js 기반 블랙홀 raymarching 1차 구현  
   - 저장소: `exp-blackhole-three-singularity`
   - Priority: P1

10. [exp] raw WebGPU 블랙홀 from-scratch baseline 구현  
    - 저장소: `exp-blackhole-webgpu-fromscratch`
    - Priority: P2

11. [bench] 블랙홀 렌더링 shootout 시나리오 정의  
    - 저장소: `bench-blackhole-render-shootout`
    - Priority: P1

12. [exp] N-body WebGPU 기준선 구현  
    - 저장소: `exp-nbody-webgpu-core`
    - Priority: P2

13. [exp] fluid / particle compute stress baseline 구현  
    - 저장소: `exp-fluid-webgpu-core`
    - Priority: P2

## ML / LLM
14. [exp] 브라우저 임베딩 throughput baseline 구현  
    - 저장소: `exp-embeddings-browser-throughput`
    - Priority: P0

15. [exp] local vector index와 semantic search 연결  
    - 저장소: `exp-embeddings-browser-throughput`
    - Priority: P1

16. [exp] 브라우저 reranker baseline 구현  
    - 저장소: `exp-reranker-browser`
    - Priority: P1

17. [exp] WebLLM 최소 채팅 데모 구현  
    - 저장소: `exp-llm-chat-runtime-shootout`
    - Priority: P0

18. [exp] Transformers.js 채팅 경로 추가  
    - 저장소: `exp-llm-chat-runtime-shootout`
    - Priority: P0

19. [exp] LLM main thread vs worker 모드 비교  
    - 저장소: `exp-llm-worker-ux`
    - Priority: P1

20. [exp] Whisper file transcription baseline 구현  
    - 저장소: `exp-stt-whisper-webgpu`
    - Priority: P0

21. [exp] microphone streaming STT 추가  
    - 저장소: `exp-stt-whisper-webgpu`
    - Priority: P1

22. [exp] PDF 기반 브라우저 RAG end-to-end 구현  
    - 저장소: `exp-rag-browser-pipeline`
    - Priority: P0

23. [exp] 브라우저 VLM 멀티모달 baseline 구현  
    - 저장소: `exp-vlm-browser-multimodal`
    - Priority: P2

24. [exp] 브라우저 diffusion baseline 구현  
    - 저장소: `exp-diffusion-webgpu-browser`
    - Priority: P2

25. [exp] 브라우저 에이전트 task baseline 구현  
    - 저장소: `exp-browser-agent-local`
    - Priority: P2

## 벤치마크
26. [bench] runtime shootout 공통 시나리오 정의  
    - 저장소: `bench-runtime-shootout`
    - Priority: P0

27. [bench] model load / cache 재사용 측정기 구현  
    - 저장소: `bench-model-load-and-cache`
    - Priority: P0

28. [bench] worker isolation / UI jank 측정기 구현  
    - 저장소: `bench-worker-isolation-and-ui-jank`
    - Priority: P0

29. [bench] WebGPU vs WASM parity 검증 시나리오 작성  
    - 저장소: `bench-webgpu-vs-wasm-parity`
    - Priority: P1

## 앱 / 쇼케이스
30. [app] Local Chat Arena 초안 생성  
    - 저장소: `app-local-chat-arena`
    - Priority: P1
