(function () {
  "use strict";

  const MESSAGE_SOURCE = "ustb-grade-rank-extension";
  const EXT_COL_CLASS = "ustb-grade-rank-ext-cell";
  const EXT_HEADER_CLASS = "ustb-grade-rank-ext-header";
  const rankByCourseName = new Map();
  const rankByCourseCode = new Map();
  const rankByCompositeKey = new Map();

  let mutationObserver = null;
  let renderTimer = 0;

  function debug(...args) {
    try {
      if (window.localStorage && window.localStorage.ustbGradeRankDebug === "1") {
        console.info("[USTB 成绩排名列]", ...args);
      }
    } catch (_error) {
      // Ignore inaccessible storage in sandboxed frames.
    }
  }

  function injectPageHook() {
    const target = document.documentElement || document.head || document.body;
    if (!target) {
      window.setTimeout(injectPageHook, 0);
      return;
    }

    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("page-hook.js");
    script.onload = () => script.remove();
    target.appendChild(script);
  }

  function normalizeText(value) {
    return String(value == null ? "" : value)
      .replace(/\s+/g, "")
      .trim();
  }

  function findRankRecords(payload) {
    const records = [];
    const seen = new WeakSet();

    function visit(value) {
      if (value == null) return;

      if (typeof value === "string") {
        try {
          visit(JSON.parse(value));
        } catch (_error) {
          // Non-JSON strings are not useful here.
        }
        return;
      }

      if (typeof value !== "object") return;
      if (seen.has(value)) return;
      seen.add(value);

      if (
        Object.prototype.hasOwnProperty.call(value, "kcmc") &&
        (Object.prototype.hasOwnProperty.call(value, "pm") ||
          Object.prototype.hasOwnProperty.call(value, "zrs"))
      ) {
        records.push(value);
      }

      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }

      Object.keys(value).forEach((key) => visit(value[key]));
    }

    visit(payload);
    return records;
  }

  function firstPresent(object, keys) {
    for (const key of keys) {
      if (object && object[key] != null && object[key] !== "") return object[key];
    }
    return "";
  }

  function compositeKey(courseCode, courseName) {
    return `${normalizeText(courseCode)}::${normalizeText(courseName)}`;
  }

  function upsertRankData(records) {
    let changed = false;

    records.forEach((record) => {
      const courseName = normalizeText(firstPresent(record, ["kcmc", "KCMC", "courseName", "kcMc"]));
      if (!courseName) return;

      const next = {
        courseName,
        rank: String(firstPresent(record, ["pm", "PM", "rank", "paiming"])),
        total: String(firstPresent(record, ["zrs", "ZRS", "total", "totalCount"])),
        courseCode: normalizeText(firstPresent(record, ["kcdm", "KCDM", "kch", "KCH", "kcbh"]))
      };

      const previous = rankByCourseName.get(courseName);
      if (!previous || previous.rank !== next.rank || previous.total !== next.total) {
        rankByCourseName.set(courseName, next);
        changed = true;
      }

      if (next.courseCode) {
        rankByCourseCode.set(next.courseCode, next);
        rankByCompositeKey.set(compositeKey(next.courseCode, courseName), next);
      }
    });

    if (changed) scheduleRender();
  }

  function scheduleRender() {
    window.clearTimeout(renderTimer);
    renderTimer = window.setTimeout(renderAllTables, 80);
  }

  function textOf(element) {
    return normalizeText(element ? element.textContent : "");
  }

  function getHeaderCells(tableRoot) {
    return Array.from(tableRoot.querySelectorAll(".el-table__header-wrapper thead th"));
  }

  function getBodyRows(tableRoot) {
    return Array.from(tableRoot.querySelectorAll(".el-table__body-wrapper tbody tr"));
  }

  function getNativeHeaderCells(table) {
    return Array.from(table.querySelectorAll(":scope > thead > tr > th, :scope > thead > tr > td"));
  }

  function readColWidth(col) {
    if (!col) return 100;
    const rawWidth = col.getAttribute("width") || col.style.width || "";
    const parsed = Number.parseInt(String(rawWidth).replace("px", ""), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 100;
  }

  function setColWidth(col, width) {
    const next = Math.max(32, Math.round(width));
    col.setAttribute("width", String(next));
    col.style.width = `${next}px`;
  }

  function cloneColgroupColumns(table, count) {
    const colgroup = table.querySelector("colgroup");
    if (!colgroup || colgroup.querySelector(`col[data-${EXT_COL_CLASS}]`)) return;

    const cols = Array.from(colgroup.children).filter((child) => child.tagName === "COL");
    const source = cols[cols.length - 1];
    const width = readColWidth(source);
    for (let index = 0; index < count; index += 1) {
      const next = source ? source.cloneNode(true) : document.createElement("col");
      next.setAttribute(`data-${EXT_COL_CLASS}`, "true");
      setColWidth(next, width);
      colgroup.appendChild(next);
    }
  }

  function getFitWidth(table) {
    const root = table.closest(".ivu-table-wrapper") || table.parentElement || document.body;
    const rectWidth = root.getBoundingClientRect ? root.getBoundingClientRect().width : 0;
    const clientWidth = root.clientWidth || document.documentElement.clientWidth || window.innerWidth;
    return Math.max(320, Math.floor(rectWidth || clientWidth) - 2);
  }

  function fitTablesToContainer(headerTable, bodyTable) {
    if (!headerTable) return;

    const tables = [headerTable, bodyTable].filter(Boolean);
    const firstColgroup = headerTable.querySelector("colgroup");
    const firstCols = firstColgroup
      ? Array.from(firstColgroup.children).filter((child) => child.tagName === "COL")
      : [];
    if (!firstCols.length) return;

    const targetWidth = getFitWidth(headerTable);
    const originalWidths = firstCols.map(readColWidth);
    const totalOriginal = originalWidths.reduce((sum, width) => sum + width, 0);
    if (!totalOriginal) return;

    const newWidths = originalWidths.map((width, index) => {
      const isExtensionColumn = firstCols[index].getAttribute(`data-${EXT_COL_CLASS}`) === "true";
      const minimum = isExtensionColumn ? 48 : 36;
      return Math.max(minimum, (width / totalOriginal) * targetWidth);
    });
    const roundedTotal = newWidths.reduce((sum, width) => sum + Math.round(width), 0);
    if (newWidths.length && roundedTotal !== targetWidth) {
      newWidths[newWidths.length - 1] += targetWidth - roundedTotal;
    }

    tables.forEach((table) => {
      table.style.width = `${targetWidth}px`;
      const colgroup = table.querySelector("colgroup");
      if (!colgroup) return;
      Array.from(colgroup.children)
        .filter((child) => child.tagName === "COL")
        .forEach((col, index) => {
          if (newWidths[index] != null) setColWidth(col, newWidths[index]);
        });
    });
  }

  function setCellText(cell, text) {
    if (!cell) return;
    const span = cell.querySelector(".ivu-table-cell span") || cell.querySelector("span");
    const tableCell = cell.querySelector(".ivu-table-cell");
    if (span) {
      span.textContent = text;
    } else if (tableCell) {
      tableCell.textContent = text;
    } else {
      cell.textContent = text;
    }
  }

  function cloneCell(source, text, header) {
    const cell = source ? source.cloneNode(true) : document.createElement(header ? "th" : "td");
    cell.classList.add(EXT_COL_CLASS);
    if (header) cell.classList.add(EXT_HEADER_CLASS);
    cell.dataset.ustbGradeRankExt = "true";
    setCellText(cell, text);

    return cell;
  }

  function appendHeaderCells(headerRow, sourceCell) {
    if (!headerRow || headerRow.querySelector(`.${EXT_HEADER_CLASS}`)) return;

    headerRow.appendChild(cloneCell(sourceCell, "排名", true));
    headerRow.appendChild(cloneCell(sourceCell, "总人数", true));
  }

  function lookupRankData(courseCode, courseName) {
    const normalizedCode = normalizeText(courseCode);
    const normalizedName = normalizeText(courseName);
    return (
      rankByCompositeKey.get(compositeKey(normalizedCode, normalizedName)) ||
      (normalizedCode ? rankByCourseCode.get(normalizedCode) : null) ||
      rankByCourseName.get(normalizedName) ||
      null
    );
  }

  function appendBodyCells(row, sourceCell, courseName, courseCode) {
    const existing = row.querySelectorAll(`:scope > .${EXT_COL_CLASS}`);
    const rankData = lookupRankData(courseCode, courseName);
    const rank = rankData ? rankData.rank : "";
    const total = rankData ? rankData.total : "";

    if (existing.length >= 2) {
      setCellText(existing[0], rank);
      setCellText(existing[1], total);
      return;
    }

    row.appendChild(cloneCell(sourceCell, rank, false));
    row.appendChild(cloneCell(sourceCell, total, false));
  }

  function headerIndexByText(headerCells, expectedText) {
    return headerCells.findIndex((cell) => textOf(cell).includes(expectedText));
  }

  function isGradeTableHeader(headerCells) {
    const headerText = headerCells.map((cell) => textOf(cell)).join("|");
    return headerText.includes("课程名称") && headerText.includes("总评成绩");
  }

  function getHeaderRowCells(row) {
    return Array.from(row ? row.children : []).filter((cell) =>
      ["TH", "TD"].includes(cell.tagName)
    );
  }

  function closestTableRoot(table) {
    return (
      table.closest(
        ".ivu-table-wrapper, .ivu-table, .layui-table-view, .layui-table-box, .el-table, .vxe-table, .ant-table-wrapper"
      ) ||
      table.parentElement ||
      document.body
    );
  }

  function visibleBodyRows(table) {
    return Array.from(table.querySelectorAll("tbody tr")).filter((row) => {
      const cells = Array.from(row.children).filter((cell) =>
        ["TD", "TH"].includes(cell.tagName)
      );
      return cells.length > 0;
    });
  }

  function findBodyTableForHeader(headerTable, headerCells) {
    const headerCount = headerCells.length;
    const root = closestTableRoot(headerTable);
    const tables = Array.from(root.querySelectorAll("table"));

    const candidates = tables
      .filter((table) => table !== headerTable)
      .map((table) => {
        const rows = visibleBodyRows(table);
        const firstRowCellCount = rows[0] ? getHeaderRowCells(rows[0]).length : 0;
        return {
          table,
          rows,
          score:
            rows.length * 10 +
            Math.max(0, Math.min(firstRowCellCount, headerCount)) -
            Math.abs(firstRowCellCount - headerCount)
        };
      })
      .filter((candidate) => candidate.rows.length && candidate.score > 0)
      .sort((a, b) => b.score - a.score);

    return candidates[0] ? candidates[0].table : null;
  }

  function renderSplitTableFromHeader(headerCell) {
    const headerRow = headerCell.closest("tr");
    const headerTable = headerCell.closest("table");
    if (!headerRow || !headerTable) {
      return false;
    }

    const headerCells = getHeaderRowCells(headerRow);
    const courseNameIndex = headerIndexByText(headerCells, "课程名称");
    const courseCodeIndex = headerIndexByText(headerCells, "课程代码");
    if (courseNameIndex < 0) return false;
    if (!isGradeTableHeader(headerCells)) return false;

    const bodyRowsInSameTable = visibleBodyRows(headerTable);
    const bodyTable =
      bodyRowsInSameTable.length > 0 ? headerTable : findBodyTableForHeader(headerTable, headerCells);
    if (!bodyTable) return false;

    appendHeaderCells(headerRow, headerCells[headerCells.length - 1]);
    cloneColgroupColumns(headerTable, 2);
    if (bodyTable !== headerTable) cloneColgroupColumns(bodyTable, 2);
    fitTablesToContainer(headerTable, bodyTable);

    visibleBodyRows(bodyTable).forEach((row) => {
      const cells = getHeaderRowCells(row);
      const courseName = textOf(cells[courseNameIndex]);
      const courseCode = courseCodeIndex >= 0 ? textOf(cells[courseCodeIndex]) : "";
      appendBodyCells(row, cells[cells.length - 1], courseName, courseCode);
    });

    debug("rendered split/native table", {
      courseNameIndex,
      bodyRows: visibleBodyRows(bodyTable).length
    });
    return true;
  }

  function renderElementTable(tableRoot) {
    const headerCells = getHeaderCells(tableRoot);
    const courseNameIndex = headerIndexByText(headerCells, "课程名称");
    if (courseNameIndex < 0) return false;
    if (!isGradeTableHeader(headerCells)) return false;

    const headerRow = headerCells[0] && headerCells[0].parentElement;
    const headerTable = tableRoot.querySelector(".el-table__header-wrapper table");
    const bodyTable = tableRoot.querySelector(".el-table__body-wrapper table");

    appendHeaderCells(headerRow, headerCells[headerCells.length - 1]);
    if (headerTable) cloneColgroupColumns(headerTable, 2);
    if (bodyTable) cloneColgroupColumns(bodyTable, 2);

    getBodyRows(tableRoot).forEach((row) => {
      const cells = Array.from(row.children);
      const courseName = textOf(cells[courseNameIndex]);
      appendBodyCells(row, cells[cells.length - 1], courseName);
    });

    return true;
  }

  function renderNativeTable(table) {
    const headerCells = getNativeHeaderCells(table);
    const courseNameIndex = headerIndexByText(headerCells, "课程名称");
    if (courseNameIndex < 0) return false;
    if (!isGradeTableHeader(headerCells)) return false;

    const headerRow = headerCells[0] && headerCells[0].parentElement;
    appendHeaderCells(headerRow, headerCells[headerCells.length - 1]);
    cloneColgroupColumns(table, 2);

    Array.from(table.querySelectorAll(":scope > tbody > tr")).forEach((row) => {
      const cells = Array.from(row.children);
      const courseName = textOf(cells[courseNameIndex]);
      appendBodyCells(row, cells[cells.length - 1], courseName);
    });

    return true;
  }

  function renderHeaderDiscoveredTables() {
    const headerCells = Array.from(document.querySelectorAll("th, td")).filter((cell) =>
      textOf(cell).includes("课程名称")
    );

    headerCells.forEach(renderSplitTableFromHeader);
  }

  function renderAllTables() {
    Array.from(document.querySelectorAll(".el-table")).forEach(renderElementTable);

    renderHeaderDiscoveredTables();

    Array.from(document.querySelectorAll("table")).forEach((table) => {
      if (table.closest(".el-table")) return;
      if (table.closest(".ivu-table-wrapper")) return;
      renderNativeTable(table);
    });
  }

  function observeDomChanges() {
    if (mutationObserver || !document.documentElement) return;

    mutationObserver = new MutationObserver(() => scheduleRender());
    mutationObserver.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (!event.data || event.data.source !== MESSAGE_SOURCE) return;
    if (event.data.type !== "GRADES_RESPONSE") return;

    const records = findRankRecords(event.data.payload);
    if (records.length) upsertRankData(records);
  });

  injectPageHook();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      observeDomChanges();
      scheduleRender();
    });
  } else {
    observeDomChanges();
    scheduleRender();
  }
})();
