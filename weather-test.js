const LOCATIONS = {
  yangshuo: { name: "阳朔", latitude: 24.780, longitude: 110.489 },
  yingxi: { name: "英西", latitude: 24.166, longitude: 112.892 },
  shegeng: { name: "社更穿洞", latitude: 23.250, longitude: 107.980 }
};

const statusEl = document.getElementById("status");
const summaryEl = document.getElementById("summary");
const selectEl = document.getElementById("locationSelect");
const loadBtn = document.getElementById("loadBtn");

let weatherChart = null;

function buildApiUrl(location) {
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

function formatDateLabel(dateStr) {
  const date = new Date(dateStr);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}/${day}`;
}

function buildSummaryCards(daily, index = 0) {
  const cards = [
    {
      label: "最高气温",
      value: `${daily.temperature_2m_max[index]} °C`
    },
    {
      label: "最低气温",
      value: `${daily.temperature_2m_min[index]} °C`
    },
    {
      label: "降水量",
      value: `${daily.precipitation_sum[index]} mm`
    },
    {
      label: "降水概率",
      value: `${daily.precipitation_probability_max[index]} %`
    },
    {
      label: "最大风速",
      value: `${daily.wind_speed_10m_max[index]} km/h`
    },
    {
      label: "平均云量",
      value: `${daily.cloud_cover_mean[index]} %`
    }
  ];

  summaryEl.innerHTML = cards.map(card => `
    <div class="metric">
      <div class="metric-label">${card.label}</div>
      <div class="metric-value">${card.value}</div>
    </div>
  `).join("");
}

function renderChart(locationName, daily) {
  const labels = daily.time.map(formatDateLabel);

  const ctx = document.getElementById("weatherChart").getContext("2d");

  if (weatherChart) {
    weatherChart.destroy();
  }

  weatherChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "最高气温 (°C)",
          data: daily.temperature_2m_max,
          yAxisID: "yTemp",
          tension: 0.35
        },
        {
          label: "最低气温 (°C)",
          data: daily.temperature_2m_min,
          yAxisID: "yTemp",
          tension: 0.35
        },
        {
          label: "降水量 (mm)",
          data: daily.precipitation_sum,
          yAxisID: "yRain",
          tension: 0.35
        },
        {
          label: "降水概率 (%)",
          data: daily.precipitation_probability_max,
          yAxisID: "yPercent",
          tension: 0.35
        },
        {
          label: "风速 (km/h)",
          data: daily.wind_speed_10m_max,
          yAxisID: "yWind",
          tension: 0.35
        },
        {
          label: "云量 (%)",
          data: daily.cloud_cover_mean,
          yAxisID: "yPercent",
          tension: 0.35
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false
      },
      plugins: {
        title: {
          display: true,
          text: `${locationName} · 未来 7 天天气`
        },
        legend: {
          position: "bottom"
        },
        tooltip: {
          callbacks: {
            label(context) {
              const label = context.dataset.label || "";
              const value = context.raw;
              return `${label}: ${value}`;
            }
          }
        }
      },
      scales: {
        yTemp: {
          type: "linear",
          position: "left",
          title: {
            display: true,
            text: "温度 (°C)"
          }
        },
        yRain: {
          type: "linear",
          position: "right",
          title: {
            display: true,
            text: "降水量 (mm)"
          },
          grid: {
            drawOnChartArea: false
          }
        },
        yWind: {
          type: "linear",
          position: "right",
          display: false
        },
        yPercent: {
          type: "linear",
          position: "right",
          min: 0,
          max: 100,
          display: false
        }
      }
    }
  });
}

async function loadWeather() {
  try {
    const locationKey = selectEl.value;
    const { location, data } = await fetchWeather(locationKey);

    if (!data.daily) {
      throw new Error("返回结果里没有 daily 数据");
    }

    renderChart(location.name, data.daily);
    buildSummaryCards(data.daily, 0);

    statusEl.textContent = `${location.name} 数据加载成功，显示未来 7 天 daily forecast。`;
  } catch (error) {
    console.error(error);
    statusEl.textContent = `加载失败：${error.message}`;
  }
}

loadBtn.addEventListener("click", loadWeather);
window.addEventListener("DOMContentLoaded", loadWeather);