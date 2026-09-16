# Travelink MCP 가이드

Model Context Protocol(MCP)을 사용하면 AI 에이전트(Claude 등)가 직접 여행 장소를 검색하고, 본 서비스에서 바로 확인할 수 있는 여행 계획 링크를 생성할 수 있습니다.

---

## 1. 개요

본 서비스는 **Stateless HTTP Transport** 방식을 통해 MCP 기능을 제공합니다.

- **MCP 엔드포인트**: `https://travelink.hshim.dev/mcp`
- **통신 방식**: HTTP POST (JSON-RPC 2.0)

웹페이지의 **AI 일정 편집**은 브라우저에서 로컬 모델로 실행됩니다. 화면 안의 AI는 장소 좌표가 필요할 때만 `search_places`를 사용하고, 일정 링크를 만드는 `create_link`는 호출하지 않습니다. AI가 반영한 일정은 기존 공유 버튼으로 사용자가 직접 공유할 수 있습니다.

브라우저의 로컬 AI는 외부 MCP와 별도로 다음 단계의 로컬 도구 계층을 사용합니다. 먼저 요청을 `answer`(답변만)와 `control`(일정 제어)로 분류하고, 제어 요청에만 도구를 선택합니다. `load_plan`은 기존 일정이 필요한 경우에만 실행되며, 이후 `add_schedule`, `update_schedule`, `delete_schedule`, `replace_schedule` 중 하나가 카드 변경을 수행합니다. 장소 검색은 `search_places`로 분리되어 지도 검색 결과를 일정 반영 또는 답변에 전달합니다.

---

## 3. 제공 도구 (Tools) 상세

### 📍 `search_places`
네이버 지도 API를 사용하여 장소의 명칭, 주소, 좌표를 검색합니다.
- **입력**: `query` (예: "강남역 맛집", "성산일출봉")
- **결과**: 장소 이름, 주소, 위도/경도(lat, lng) 목록

### 📅 `create_link`
검색된 장소들을 묶어 본 서비스에서 바로 확인할 수 있는 여행 일정 링크를 생성합니다.
- **입력**: 
  - `title`: 여행 제목
  - `items`: 일정 리스트 (장소명, 주소, 좌표, 날짜, 시간, 메모 등)
- **결과**: `https://travelink.hshim.dev/#<encoded_data>` 형태의 완성된 링크

---

## 4. 활용 예시

AI 에이전트에게 다음과 같이 요청해 보세요!

> "이번 주말에 갈만한 경주 1박 2일 여행 코스 짜주고 travelink 링크 만들어줘." <br>
> "제주도 동쪽 맛집 투어 일정 만들어서 공유 링크 생성해줘."

에이전트가 `search_places`로 정확한 위치 정보를 가져온 뒤, `create_link`를 호출하여 최종 결과물을 제공합니다.
