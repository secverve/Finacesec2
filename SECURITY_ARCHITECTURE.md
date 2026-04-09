# 보안 아키텍처 설명서

## 목표

이 프로젝트는 단순한 모의 HTS가 아니라 `증권 HTS 보안 관제/실습 플랫폼`을 목표로 설계되었습니다.

핵심 방향:

- 주문 이전에 FDS와 보안 통제를 모두 적용
- 단말, 세션, 주문, 감사 로그를 연결해서 사건을 추적 가능하게 구성
- 관리자 로그인 시 곧바로 관제형 보안 콘솔이 보이도록 구성

## 아키텍처 레이어

### 1. 인증 보안

- JWT 토큰 발급
- 로그인 실패 누적 시 계정 잠금
- 로그인 성공 시 감사 로그 저장
- 로그인 성공 시 보안 단말 레코드와 인증 세션 생성

### 2. 단말 신뢰 레이어

신규 테이블:

- `security_devices`

주요 속성:

- 사용자별 단말 식별
- 단말 표시명
- fingerprint hash
- 신뢰 상태
  - `TRUSTED`
  - `WATCH`
  - `STEP_UP_REQUIRED`
  - `BLOCKED`
- 위험 점수
- 침해 신호 수
- 마지막 IP / 지역 / User-Agent

운영 기능:

- 관리자 신뢰 승인
- 단계인증 유지
- 차단
- 단말 차단 시 해당 단말 세션 일괄 회수

### 3. 세션 보안 레이어

신규 테이블:

- `auth_sessions`

주요 속성:

- 사용자
- 단말
- IP / 지역 / User-Agent
- 인증 강도
  - `PASSWORD_ONLY`
  - `PASSWORD_PLUS_DEVICE`
  - `STEP_UP_REQUIRED`
  - `ADMIN_APPROVED`
- 세션 상태
  - `ACTIVE`
  - `REVOKED`
  - `EXPIRED`
- 세션 위험 점수
- 만료 시각

보안 동작:

- 로그인 시 세션 생성
- 토큰에 세션 ID(`sid`) 포함
- 인증된 API 접근 시 세션 활성 상태 확인
- 토큰을 다른 단말 ID로 재사용하면 `Session device mismatch`로 차단
- 관리자 세션 회수 가능

### 4. 주문 보안 통제

주문 시 적용되는 보안 구조:

1. 주문 생성
2. FDS 룰 평가
3. 세션/단말 기반 보안 통제 추가 적용
4. 허용 / 보류 / 차단 결정

추가 통제 예시:

- 신뢰되지 않은 단말에서 고액 주문 시 `추가 인증`
- 차단된 단말에서 주문 시 즉시 `차단`
- 고위험 세션에서 고액 주문 시 `보류`

### 5. FDS 레이어

기존 FDS 룰과 함께 동작:

- 신규 단말 고액 주문
- 해외 고위험 지역 주문
- 로그인 실패 후 주문
- 주문 금액 급증
- 주문 폭주/취소 이상행위
- 감시 종목 주문
- 동일 IP 다계정 거래

FDS 결과 저장:

- `risk_events`
- `rule_hits`

### 6. 추가 인증 레이어

기존 `additional_auth_requests`를 활용해 보안 주문 통제와 연결했습니다.

발생 조건:

- FDS 판단으로 추가 인증 필요
- 세션/단말 보안 정책으로 step-up 필요

결과:

- 주문 상태 `HELD`
- 위험 이벤트 상태 `AUTH_REQUIRED`
- 관리자 승인 또는 추가 조치 필요

### 7. 감사/포렌식 레이어

감사 구조:

- 요청 단위 `request_id`
- IP / 지역 / 디바이스 / User-Agent
- 이벤트별 structured payload

저장 이벤트 예시:

- `LOGIN_SUCCEEDED`
- `LOGIN_FAILED`
- `ORDER_CREATED`
- `ORDER_EXECUTED`
- `ORDER_SECURITY_STEP_UP`
- `ORDER_SECURITY_BLOCKED`
- `SECURITY_DEVICE_ACTION`
- `SECURITY_SESSION_REVOKED`
- `ADMIN_ACTION`

## 관리자 관제 콘솔 구성

관리자 로그인 시 상단 보안 탭:

- `실시간 관제`
- `사건 분석`
- `세션 보안`
- `단말 신뢰`
- `보안 정책`
- `감사/포렌식`
- `공격 실습`
- `시장 참조`

주요 관제 기능:

- 실시간 위험 이벤트 큐
- 선택 사건 룰 히트 분석
- 사건 타임라인
- FDS 탐지 로그 창
- 상관분석 로그 스트림
- 활성/고위험 세션 목록
- 신뢰 단말 관리
- 정책 카탈로그
- 공격 실습 시나리오

## 포트폴리오 관점에서의 의미

이번 구조 확장으로 프로젝트는 단순한 주식 UI가 아니라 다음 역량을 보여줄 수 있습니다.

- 인증/세션 보안 설계
- 신뢰 단말 관리
- 주문 보안 통제
- FDS와 보안 통제의 결합
- 보안 관제 UI 설계
- 사건 포렌식/감사 추적
- 관리자 대응 워크플로우

## 현재 실행 경로

- 프론트: `http://localhost:3000`
- 백엔드: `http://localhost:8000`
- 헬스체크: `http://localhost:8000/api/v1/health`
- API 문서: `http://localhost:8000/docs`
