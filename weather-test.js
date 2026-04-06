const LOCATIONS = {
  yangshuo: { name: "阳朔", latitude: 24.780, longitude: 110.489 },
  yingxi: { name: "英西", latitude: 24.166, longitude: 112.892 },
  shegeng: { name: "社更穿洞", latitude: 23.250, longitude: 107.980 }
};

const statusEl = document.getElementById("status");
const summaryEl = document.getElementById("summary");
const selectEl = document.getElementById("locationSelect");
const loadBtn = document.getElementById("loadBtn");

let tempChart = null;
let precipChart = null;
let cloudChart = null;
let windChart = null;

/**
 * 插件1：根据 is_day 画夜间阴影
 */
const nightShadePlugin = {
  id: "nightShadePlugin",
  beforeDraw(chart, args, pluginOptions) {
    const xScale = chart.scales.x;
    const chartArea = chart.chartArea;
    const axisInfo = pluginOptions?.axisInfo;

    if (!xScale || !chartArea || !axisInfo?.nightRanges?.length) return;

    const { ctx } = chart;
    ctx.save();
    ctx.fillStyle = pluginOptions.color || "rgba(120, 130, 145, 0.10)";

    axisInfo.nightRanges.forEach(([startIndex, endIndex]) => {
      const x1 = xScale.getPixelForValue(startIndex);
      const x2 = xScale.getPixelForValue(endIndex);

      const left = Math.max(chartArea.left, Math.min(x1, x2));
      const right = Math.min(chartArea.right, Math.max(x1, x2));

      if (right > left) {
        ctx.fillRect(left, chartArea.top, right - left, chartArea.bottom - chartArea.top);
      }
    });

    ctx.restore();
  }
};

/**
 * 插件2：每天 0 点画较粗的竖线，并在底部写日期
 */
const daySeparatorPlugin = {
  id: "daySeparatorPlugin",
  afterDraw(chart, args, pluginOptions) {
    const { ctx, chartArea, scales } = chart;
    const xScale = scales.x;
    if (!xScale || !pluginOptions?.dayStarts?.length) return;

    const top = chartArea.top;
    const bottom = chartArea.bottom;

    ctx.save();

    // 每天 0 点分隔线：更粗一点
    ctx.strokeStyle = pluginOptions.lineColor || "rgba(70, 80, 90, 0.38)";
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = pluginOptions.lineWidth || 1.2;

    pluginOptions.dayStarts.forEach((idx) => {
      const x = xScale.getPixelForValue(idx);
      if (x >= chartArea.left && x <= chartArea.right) {
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom);
        ctx.stroke();
      }
    });

    ctx.setLineDash([]);

    // 底部日期标签
    const labels = pluginOptions.dayLabels || [];
    ctx.fillStyle = pluginOptions.labelColor || "#5b6572";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    labels.forEach(({ index, text }) => {
      const nextStart = pluginOptions.dayStarts.find(v => v > index);
      const endIndex = nextStart ? nextStart - 1 : chart.data.labels.length - 1;

      const x1 = xScale.getPixelForValue(index);
      const x2 = xScale.getPixelForValue(endIndex);
      const mid = (x1 + x2) / 2;

      if (mid >= chartArea.left && mid <= chartArea.right) {
        ctx.fillText(text, mid, bottom + 22);
      }
    });

    ctx.restore();
  }
};

/**
 * 插件3：风向箭头（只有箭头头部）
 */
const windArrowPlugin = {
  id: "windArrowPlugin",
  afterDatasetsDraw(chart, args, pluginOptions) {
    const directions = pluginOptions?.directions;
    const everyN = pluginOptions?.everyN ?? 3;
    if (!directions || !directions.length) return;

    const { ctx, scales, chartArea } = chart;
    const xScale = scales.x;
    const yScale = scales.y;

    const dataset = chart.data.datasets[0];
    if (!dataset?.data?.length) return;

    ctx.save();
    ctx.strokeStyle = pluginOptions.color || "#e34d42";
    ctx.lineWidth = 1.5;

    for (let i = 0; i < dataset.data.length; i += everyN) {
      const speed = dataset.data[i];
      const dir = directions[i];

      if (speed == null || dir == null) continue;

      const x = xScale.getPixelForValue(i);
      const y = yScale.getPixelForValue(speed);

      if (
        x < chartArea.left || x > chartArea.right ||
        y < chartArea.top || y > chartArea.bottom
      ) {
        continue;
      }

      drawArrowHead(ctx, x, y - 8, 8, dir);
    }

    ctx.restore();
  }
};

Chart.register(nightShadePlugin, daySeparatorPlugin, windArrowPlugin);

/**
 * 只画箭头头部
 * Open-Meteo 风向是气象风向（风从哪里来），这里 +180° 画成风吹去的方向
 */
function drawArrowHead(ctx, x, y, size, directionDegrees) {
  const angle = ((directionDegrees + 180) * Math.PI) / 180;

  const tipX = x + size * Math.cos(angle);
  const tipY = y + size * Math.sin(angle);

  const backLen = size * 0.9;
  const wingAngle = Math.PI / 6;

  const leftX = tipX - backLen * Math.cos(angle - wingAngle);
  const leftY = tipY - backLen * Math.sin(angle - wingAngle);

  const rightX = tipX - backLen * Math.cos(angle + wingAngle);
  const rightY = tipY - backLen * Math.sin(angle + wingAngle);

  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(leftX, leftY);
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(rightX, rightY);
  ctx.stroke();
}

function buildApiUrl(location) {
  const hourlyVars = [
    "temperature_2m",
    "apparent_temperature",
    "precipitation",
    "precipitation_probability",
    "cloud_cover",
    "wind_speed_10m",
    "wind_direction_10m",
    "is_day"
  ].join(",");

  const dailyVars = [
    "temperature_2m_max",
    "temperature_2m_min",
    "precipitation_sum",
    "precipitation_probability_max",
    "wind_speed_10m_max",
    "cloud_cover_mean"
  ].join(",");

  const params = new URLSearchParams({
    latitude: location.latitude,
    longitude: location.longitude,
    hourly: hourlyVars,
    daily: dailyVars,
    timezone: "auto",
    forecast_days: "7"
  });

  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

async function fetchWeather(locationKey) {
  const location = LOCATIONS[locationKey];
  const url = buildApiUrl(location);

  statusEl.textContent = `正在加载 ${location.name} 的天气数据…`;
  summaryEl.innerHTML = "";

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`接口请求失败：${response.status}`);
  }

  const data = await response.json();
  return { location, data };
}

function formatDayLabel(dateStr) {
  const d = new Date(dateStr);
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const weekday = weekdays[d.getDay()];
  const month = d.getMonth() + 1;
  const day = d.getDate();
  return `${weekday} ${month}/${day}`;
}

function makeTickLabel(hour) {
  if (hour === 0) return "0";
  if (hour === 6) return "6";
  if (hour === 12) return "12";
  if (hour === 18) return "18";
  return "";
}

function buildHourlyAxisInfo(hourlyTimes, isDayArray) {
  const labels = [];
  const tickPositions = [];
  const dayStarts = [];
  const dayLabels = [];
  const nightRanges = [];

  let inNight = false;
  let currentNightStart = null;

  hourlyTimes.forEach((timeStr, index) => {
    const d = new Date(timeStr);
    const hour = d.getHours();

    labels.push(makeTickLabel(hour));

    // 只保留 0 / 6 / 12 / 18 这些刻度位置
    if ([0, 6, 12, 18].includes(hour)) {
      tickPositions.push(index);
    }

    if (hour === 0) {
      dayStarts.push(index);
      dayLabels.push({
        index,
        text: formatDayLabel(timeStr)
      });
    }

    const isDay = Number(isDayArray[index]) === 1;
    const isNight = !isDay;

    if (isNight && !inNight) {
      inNight = true;
      currentNightStart = index;
    }

    if (!isNight && inNight) {
      inNight = false;
      nightRanges.push([currentNightStart, index]);
      currentNightStart = null;
    }
  });

  if (inNight && currentNightStart !== null) {
    nightRanges.push([currentNightStart, hourlyTimes.length - 1]);
  }

  return { labels, tickPositions, dayStarts, dayLabels, nightRanges };
}

function buildSummaryCards(daily) {
  const cards = [
    {
      label: "最高气温",
      value: `${Math.max(...daily.temperature_2m_max)} °C`
    },
    {
      label: "最低气温",
      value: `${Math.min(...daily.temperature_2m_min)} °C`
    },
    {
      label: "总降水量",
      value: `${daily.precipitation_sum.reduce((a, b) => a + b, 0).toFixed(1)} mm`
    },
    {
      label: "最大降水概率",
      value: `${Math.max(...daily.precipitation_probability_max)} %`
    },
    {
      label: "最大风速",
      value: `${Math.max(...daily.wind_speed_10m_max).toFixed(1)} km/h`
    },
    {
      label: "平均云量",
      value: `${Math.round(
        daily.cloud_cover_mean.reduce((a, b) => a + b, 0) / daily.cloud_cover_mean.length
      )} %`
    }
  ];

  summaryEl.innerHTML = cards.map(card => `
    <div class="metric">
      <div class="metric-label">${card.label}</div>
      <div class="metric-value">${card.value}</div>
    </div>
  `).join("");
}

function makeBaseOptions(axisInfo) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: "index",
      intersect: false
    },
    plugins: {
      legend: {
        position: "top",
        align: "end",
        labels: {
          boxWidth: 22,
          color: "#5b6572"
        }
      },
      tooltip: {
        callbacks: {
          title(items) {
            if (!items.length) return "";
            const i = items[0].dataIndex;
            return axisInfo.originalTimes[i];
          }
        }
      },
      nightShadePlugin: {
        axisInfo,
        color: "rgba(120, 130, 145, 0.10)"
      },
      daySeparatorPlugin: {
        dayStarts: axisInfo.dayStarts,
        dayLabels: axisInfo.dayLabels,
        lineColor: "rgba(70, 80, 90, 0.42)",
        lineWidth: 1.2
      }
    },
    scales: {
      x: {
        ticks: {
          autoSkip: false,
          color: "#5b6572",
          maxRotation: 0,
          minRotation: 0,
          callback(value, index) {
            return axisInfo.labels[index];
          }
        },
        grid: {
          color(context) {
            const idx = context.index;
            if (axisInfo.dayStarts.includes(idx)) {
              return "rgba(0,0,0,0)"; // 0点加粗竖线由 daySeparatorPlugin 负责
            }
            if (axisInfo.tickPositions.includes(idx)) {
              return "rgba(0,0,0,0.08)";
            }
            return "rgba(0,0,0,0)";
          },
          lineWidth(context) {
            const idx = context.index;
            if (axisInfo.tickPositions.includes(idx)) {
              return 1;
            }
            return 0;
          },
          drawTicks: true
        }
      },
      y: {
        ticks: {
          color: "#5b6572"
        },
        grid: {
          color: "rgba(0,0,0,0.06)"
        }
      }
    },
    layout: {
      padding: {
        bottom: 28
      }
    }
  };
}

function destroyExistingCharts() {
  [tempChart, precipChart, cloudChart, windChart].forEach(chart => {
    if (chart) chart.destroy();
  });
}

function renderCharts(locationName, hourly) {
  destroyExistingCharts();

  const axisInfo = buildHourlyAxisInfo(hourly.time, hourly.is_day);
  axisInfo.originalTimes = hourly.time;

  // Temperature
  tempChart = new Chart(document.getElementById("tempChart"), {
    type: "line",
    data: {
      labels: axisInfo.labels,
      datasets: [
        {
          label: "Temperature",
          data: hourly.temperature_2m,
          borderColor: "#58c18f",
          backgroundColor: "#58c18f",
          pointRadius: 0,
          borderWidth: 2.5,
          tension: 0.35
        },
        {
          label: "Feels Like",
          data: hourly.apparent_temperature,
          borderColor: "#3d6cf4",
          backgroundColor: "#3d6cf4",
          borderDash: [6, 4],
          pointRadius: 0,
          borderWidth: 2,
          tension: 0.35
        }
      ]
    },
    options: {
      ...makeBaseOptions(axisInfo),
      scales: {
        ...makeBaseOptions(axisInfo).scales,
        y: {
          title: {
            display: true,
            text: "Celsius"
          },
          ticks: { color: "#5b6572" },
          grid: { color: "rgba(0,0,0,0.06)" }
        }
      }
    }
  });

  // Precipitation
  precipChart = new Chart(document.getElementById("precipChart"), {
    data: {
      labels: axisInfo.labels,
      datasets: [
        {
          type: "bar",
          label: "Precipitation (mm)",
          data: hourly.precipitation,
          backgroundColor: "rgba(72, 138, 255, 0.45)",
          borderColor: "rgba(72, 138, 255, 0.85)",
          borderWidth: 1,
          yAxisID: "y"
        },
        {
          type: "line",
          label: "Probability (%)",
          data: hourly.precipitation_probability,
          borderColor: "#f0b94b",
          backgroundColor: "#f0b94b",
          pointRadius: 0,
          borderWidth: 2,
          tension: 0.3,
          yAxisID: "y1"
        }
      ]
    },
    options: {
      ...makeBaseOptions(axisInfo),
      scales: {
        x: {
          ...makeBaseOptions(axisInfo).scales.x
        },
        y: {
          position: "left",
          title: {
            display: true,
            text: "mm"
          },
          ticks: { color: "#5b6572" },
          grid: { color: "rgba(0,0,0,0.06)" }
        },
        y1: {
          position: "right",
          min: 0,
          max: 100,
          title: {
            display: true,
            text: "%"
          },
          grid: {
            drawOnChartArea: false
          },
          ticks: { color: "#5b6572" }
        }
      }
    }
  });

  // Cloud Cover
  cloudChart = new Chart(document.getElementById("cloudChart"), {
    type: "line",
    data: {
      labels: axisInfo.labels,
      datasets: [
        {
          label: "Cloud Cover",
          data: hourly.cloud_cover,
          borderColor: "#7a8faa",
          backgroundColor: "#7a8faa",
          pointRadius: 0,
          borderWidth: 2.5,
          tension: 0.35
        }
      ]
    },
    options: {
      ...makeBaseOptions(axisInfo),
      scales: {
        ...makeBaseOptions(axisInfo).scales,
        y: {
          min: 0,
          max: 100,
          title: {
            display: true,
            text: "Percentage"
          },
          ticks: { color: "#5b6572" },
          grid: { color: "rgba(0,0,0,0.06)" }
        }
      }
    }
  });

  // Wind
  windChart = new Chart(document.getElementById("windChart"), {
    type: "line",
    data: {
      labels: axisInfo.labels,
      datasets: [
        {
          label: "Wind Speed",
          data: hourly.wind_speed_10m,
          borderColor: "#ef4d43",
          backgroundColor: "#ef4d43",
          pointRadius: 0,
          pointHoverRadius: 0,
          borderWidth: 2,
          tension: 0.25
        }
      ]
    },
    options: {
      ...makeBaseOptions(axisInfo),
      plugins: {
        ...makeBaseOptions(axisInfo).plugins,
        windArrowPlugin: {
          directions: hourly.wind_direction_10m,
          everyN: 3,
          color: "#ef4d43"
        }
      },
      scales: {
        ...makeBaseOptions(axisInfo).scales,
        y: {
          title: {
            display: true,
            text: "km/h"
          },
          ticks: { color: "#5b6572" },
          grid: { color: "rgba(0,0,0,0.06)" }
        }
      }
    }
  });
}

async function loadWeather() {
  try {
    const locationKey = selectEl.value;
    const { location, data } = await fetchWeather(locationKey);

    if (!data.hourly || !data.daily) {
      throw new Error("返回结果缺少 hourly 或 daily 数据");
    }

    renderCharts(location.name, data.hourly);
    buildSummaryCards(data.daily);

    statusEl.textContent = `${location.name} 数据加载成功，当前显示未来 7 天 hourly weather detail。`;
  } catch (error) {
    console.error(error);
    statusEl.textContent = `加载失败：${error.message}`;
  }
}

loadBtn.addEventListener("click", loadWeather);
window.addEventListener("DOMContentLoaded", loadWeather);