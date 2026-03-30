# Travel Plan MCP 가이드

Model Context Protocol(MCP)을 사용하면 AI 에이전트(Claude 등)가 직접 여행 장소를 검색하고, 본 서비스에서 바로 확인할 수 있는 여행 계획 링크를 생성할 수 있습니다.

---

## 1. 개요

본 서비스는 **Stateless HTTP Transport** 방식을 통해 MCP 기능을 제공합니다.

- **MCP 엔드포인트**: `https://travel.hspace.site/mcp`
- **통신 방식**: HTTP POST (JSON-RPC 2.0)

---

## 3. 제공 도구 (Tools) 상세

### 📍 `search_places`
네이버 지도 API를 사용하여 장소의 명칭, 주소, 좌표를 검색합니다.
- **입력**: `query` (예: "강남역 맛집", "성산일출봉")
- **결과**: 장소 이름, 주소, 위도/경도(lat, lng) 목록

### 📅 `create_travel_plan`
검색된 장소들을 묶어 본 서비스에서 바로 확인할 수 있는 여행 일정 링크를 생성합니다.
- **입력**: 
  - `title`: 여행 제목
  - `items`: 일정 리스트 (장소명, 주소, 좌표, 날짜, 시간, 메모 등)
- **결과**: `https://travel.hspace.site/#<encoded_data>` 형태의 완성된 링크

---

## 4. 활용 예시

AI 에이전트에게 다음과 같이 요청해 보세요!

> "이번 주말에 갈만한 경주 1박 2일 여행 코스 짜주고 travel-plan 링크 만들어줘." <br>
> "제주도 동쪽 맛집 투어 일정 만들어서 공유 링크 생성해줘."

에이전트가 `search_places`로 정확한 위치 정보를 가져온 뒤, `create_travel_plan`을 호출하여 최종 결과물을 제공합니다.
