# Share и PNG — фиксы (2026-07-01)

**Date:** 2026-07-01  
**Status:** Shipped on `dev` → applied to production PocketBase immediately  
**Commits:** `9274604`, `42bb727`  
**Branch:** `dev` → Dokploy **development** (`dev.cashbackbrain.ru`)

Три независимых бага в функциях «Поделиться» и «Сохранить PNG», обнаруженных при тестировании production-версии.

---

## 1. Share: ссылка генерировалась для пустой таблицы

### Проблема

`handleShare` в `results-screen.tsx` проверял `providers.length` чтобы определить, есть ли данные:

```ts
const hasBank = (matrix.bank?.providers.length ?? 0) > 0
const hasMarket = (matrix.market?.providers.length ?? 0) > 0
```

Если провайдеры были добавлены, но OCR не распознал ни одной категории (`rows.length === 0`), функция всё равно считала матрицу непустой и генерировала ссылку `?kind=market` на пустую страницу.

При этом страница шаринга `/share/[id]/page.tsx` уже корректно проверяла `rows.length`:

```ts
const showMarket = kind !== "bank" && !!market_matrix && market_matrix.rows.length > 0
```

### Решение

Выровнять проверку с логикой страницы шаринга:

```ts
const hasBank = (matrix.bank?.rows.length ?? 0) > 0
const hasMarket = (matrix.market?.rows.length ?? 0) > 0
```

### Файл

`components/screens/results-screen.tsx` — функция `handleShare`

---

## 2. PNG: категории сохранялись в свёрнутом виде

### Проблема

`handleSavePng` запускал `toPng` немедленно, не дожидаясь раскрытия категорий. Группы с подкатегориями (например «Продукты → Пятёрочка, Магнит...») оставались свёрнутыми в захваченном изображении.

### Решение

Разделить «триггер» и «захват» через состояние `isCapturing`:

1. `handleSavePng` выставляет `isCapturing = true` и немедленно возвращает управление.
2. В рендере: `isExpanded = hasSubcategories && (expandedParents.has(group.parent) || isCapturing)` — при `isCapturing=true` все группы отрисовываются раскрытыми.
3. `useEffect([isCapturing])` срабатывает **после** рендера (DOM уже обновлён) и выполняет захват.
4. По завершении `isCapturing` сбрасывается, категории возвращаются в исходное состояние.

### Файл

`components/screens/results-screen.tsx` — добавлен `isCapturing: boolean`, рефакторинг `handleSavePng` → `useEffect`

---

## 3. Share: ссылка открывалась как 404

### Проблема

Страница `/share/[id]/page.tsx` — серверный компонент Next.js. Она делает fetch к PocketBase **без токена авторизации**:

```ts
const res = await fetch(`${PB_URL}/api/collections/saved_matrices/records/${id}`)
```

Но `viewRule` коллекции `saved_matrices` был:

```python
"viewRule": "user = @request.auth.id"
```

PocketBase возвращал **403** для неавторизованных запросов → `res.ok === false` → `fetchRecord` возвращал `null` → `notFound()` → **404 страница**.

Это означало, что любой получатель share-ссылки видел 404, включая самого владельца записи (открывший ссылку в новой вкладке без токена).

### Решение

Изменить `viewRule` на `""` (публичный доступ по ID):

```python
"viewRule": "",   # публичный просмотр по ID
"listRule": "user = @request.auth.id",  # листинг только владелец
```

**Безопасность:** `listRule` по-прежнему запрещает перечислять чужие записи. ID записи — 15 случайных base62-символов (~89 бит энтропии), что достаточно как непредсказуемый «share-токен».

### Где изменено

| Где | Что |
|-----|-----|
| `scripts/setup_pocketbase.py` | `viewRule: ""` в `_saved_matrices_spec()` — для dev и будущих окружений |
| Production PocketBase `pb.cashbackbrain.ru` | PATCH `/api/collections/pbc_2225066241` применён **сразу** без редеплоя |

---

## Итог

| Баг | Файл | Коммит |
|-----|------|--------|
| Share генерировал ссылку на пустую таблицу | `results-screen.tsx` | `9274604` |
| PNG сохранял свёрнутые категории | `results-screen.tsx` | `9274604` |
| Share-ссылка давала 404 | `setup_pocketbase.py` + PocketBase prod | `42bb727` |
