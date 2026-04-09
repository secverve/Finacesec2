# RULES.md

## FDS Rule 설계 원칙

1. 모든 룰은 다음 속성을 가진다
- rule_code
- rule_name
- description
- score
- severity
- condition
- reason_template

2. 룰은 독립적으로 동작해야 한다

3. 여러 룰이 동시에 트리거될 수 있다

4. 최종 점수는 합산한다

5. reason_template는 사용자에게 보여질 문장이다

## 예시

- FOREIGN_IP_LOGIN
- NEW_DEVICE_ORDER
- HIGH_AMOUNT_SPIKE
- BURST_ORDER
- FAILED_LOGIN_THEN_ORDER

