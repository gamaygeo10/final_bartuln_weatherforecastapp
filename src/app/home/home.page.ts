import { Component, OnInit } from '@angular/core';
import { Geolocation } from '@capacitor/geolocation';
import { MenuController, ToastController } from '@ionic/angular';
import axios from 'axios';
import { Preferences } from '@capacitor/preferences';
import { LocalNotifications } from '@capacitor/local-notifications';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: false,
})
export class HomePage implements OnInit {
  currentWeather: any = null;
  currentForecast: any = null;
  searchQuery: string = '';
  searchedWeather: any = null;
  showModal: boolean = false;
  temperatureUnit: string = 'metric';
  enableAlerts: boolean = false;
  appTheme: string = 'light';
  isSettingsOpen: boolean = false;
  isOnline: boolean = navigator.onLine;

  slideOpts = {
    initialSlide: 0,
    speed: 400,
    slidesPerView: 1,
    spaceBetween: 10,
    loop: true,
  };

  // api keys
  private apiKey: string = 'diri ibutang api key';
  private weatherUrl: string = 'https://api.openweathermap.org/data/2.5/weather';
  private forecastUrl: string = 'https://api.openweathermap.org/data/2.5/forecast';

  private countryCodeMap: { [key: string]: string } = {
    PH: 'Philippines', US: 'United States', CA: 'Canada', GB: 'United Kingdom',
    AU: 'Australia', IN: 'India', CN: 'China', JP: 'Japan', FR: 'France',
    DE: 'Germany', IT: 'Italy', ES: 'Spain', RU: 'Russia', BR: 'Brazil',
    MX: 'Mexico', ZA: 'South Africa', NG: 'Nigeria', EG: 'Egypt',
    AR: 'Argentina', CO: 'Colombia', KR: 'South Korea', VN: 'Vietnam',
    TH: 'Thailand', MY: 'Malaysia', SG: 'Singapore', ID: 'Indonesia',
    SA: 'Saudi Arabia', AE: 'United Arab Emirates', TR: 'Turkey',
    IR: 'Iran', PK: 'Pakistan', BD: 'Bangladesh',
  };

  constructor(private menuCtrl: MenuController, private toastController: ToastController) {
    window.addEventListener('offline', () => {
      this.isOnline = false;
    });

    window.addEventListener('online', () => {
      this.isOnline = true;
      this.getWeatherForCurrentLocation();
    });
  }

  getCountryName(code: string): string {
    return this.countryCodeMap[code] || code;
  }


  async ngOnInit() {
    document.body.setAttribute('color-theme', this.appTheme);
    await this.requestNotificationPermission();
    await LocalNotifications.requestPermissions();
    const savedTheme = await Preferences.get({ key: 'theme' });
    if (savedTheme.value) {
    this.appTheme = savedTheme.value;
    document.body.setAttribute('color-theme', this.appTheme);
    }

    const savedTemperatureUnit = await Preferences.get({ key: 'temperatureUnit' });
    if (savedTemperatureUnit.value) {
      this.temperatureUnit = savedTemperatureUnit.value;
    }

    const cachedWeather = await Preferences.get({ key: 'currentWeather' });
    const cachedForecast = await Preferences.get({ key: 'currentForecast' });
    if (cachedWeather.value) this.currentWeather = JSON.parse(cachedWeather.value);
    if (cachedForecast.value) this.currentForecast = JSON.parse(cachedForecast.value);

    if (this.isOnline) {
      await this.getWeatherForCurrentLocation();
    }
  }

  hourdt_txt(index: number): string {
    const hour = 16 + index;
    const hour12 = hour > 12 ? hour - 12 : hour;
    const ampm = hour >= 12 ? 'PM' : 'AM';
    return `${hour12}:00 ${ampm}`;
  }

  // current weather/ locaton
  async getWeatherForCurrentLocation() {
    try {
      const coordinates = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
      const lat = coordinates.coords.latitude;
      const lon = coordinates.coords.longitude;

      this.currentWeather = await this.getWeatherByCoords(lat, lon);
      await Preferences.set({ key: 'currentWeather', value: JSON.stringify(this.currentWeather) });

      this.currentForecast = await this.getForecastByCoords(lat, lon);
      await Preferences.set({ key: 'currentForecast', value: JSON.stringify(this.currentForecast) });

      if (this.enableAlerts) {
        await this.checkSevereWeatherAlerts(lat, lon);
      }
    } catch (error) {
      const cachedWeather = await Preferences.get({ key: 'currentWeather' });
      const cachedForecast = await Preferences.get({ key: 'currentForecast' });
      if (cachedWeather.value) this.currentWeather = JSON.parse(cachedWeather.value);
      if (cachedForecast.value) this.currentForecast = JSON.parse(cachedForecast.value);
    }
  }

  async requestNotificationPermission() {
    const permission = await LocalNotifications.requestPermissions();
    if (permission.display === 'granted') {
      console.log('Notification permission granted.');
    } else {
      console.warn('Notification permission denied.');
    }
  }

  async sendNotification(title: string, body: string) {
    try {
      await LocalNotifications.schedule({
        notifications: [{
          id: new Date().getTime(),
          title: title,
          body: body,
          schedule: { at: new Date(new Date().getTime() + 1000) },
          sound: undefined,
          smallIcon: 'ic_stat_name',
          actionTypeId: '',
          extra: null,
        }],
      });
    } catch (error) {
      console.error('Error scheduling notification:', error);
    }
  }

  // theme
  async updateTheme(theme: string) {
    this.appTheme = theme;
    document.body.setAttribute('color-theme', theme);
    await Preferences.set({ key: 'theme', value: theme });
  }

  // working alerts/notfcatons
  async updateAlerts(enable: boolean) {
    this.enableAlerts = enable;

    const message = enable
      ? 'Severe Weather Alerts Enabled'
      : 'Severe Weather Alerts Disabled';

    await this.showToast(message);
    await this.sendNotification(message, enable
      ? 'You will now receive notifications for severe weather alerts.'
      : 'You will no longer receive notifications for severe weather alerts.');
  }

  async checkSevereWeatherAlerts(lat: number, lon: number) {
    try {
      const res = await axios.get(
        `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lon}&appid=${this.apiKey}&units=${this.temperatureUnit}`
      );

      const alerts = res.data.alerts;
      if (alerts?.length) {
        for (const alert of alerts) {
          await this.sendLocalNotification(alert.event, alert.description);
        }
      }
    } catch (error) {
      console.error('Error fetching alerts:', error);
    }
  }

  async sendLocalNotification(title: string, body: string) {
    const permission = await LocalNotifications.requestPermissions();
    if (permission.display === 'granted') {
      await LocalNotifications.schedule({
        notifications: [{
          id: new Date().getTime(),
          title,
          body,
          schedule: { at: new Date(new Date().getTime() + 1000) },
          sound: undefined,
          smallIcon: 'ic_stat_name',
          actionTypeId: '',
          extra: null,
        }],
      });
    }
  }

  // get current loc coords
  async getWeatherByCoords(lat: number, lon: number) {
    const res = await axios.get(`${this.weatherUrl}?lat=${lat}&lon=${lon}&appid=${this.apiKey}&units=${this.temperatureUnit}`);
    return res.data;
  }

  //get forecasts coords
  async getForecastByCoords(lat: number, lon: number) {
    const res = await axios.get(`${this.forecastUrl}?lat=${lat}&lon=${lon}&appid=${this.apiKey}&units=${this.temperatureUnit}`);
    return res.data;
  }

  // search
  async getWeatherForSearch() {
    if (!this.searchQuery) {
      alert('Please enter a location.');
      return;
    }
  
    if (!this.isOnline) {
      // Handle offline mode
      const savedUnitKey = this.temperatureUnit === 'metric' ? 'savedWeatherC' : 'savedWeatherF';
      const savedWeather = await Preferences.get({ key: savedUnitKey });
  
      if (savedWeather.value) {
        const parsedWeather = JSON.parse(savedWeather.value);
        if (parsedWeather.name.toLowerCase() === this.searchQuery.toLowerCase()) {
          this.searchedWeather = parsedWeather;
          this.showModal = true;
        } else {
          alert('Weather data for this location and unit is not saved locally. Internet connection is required to update.');
        }
      } else {
        alert('Weather data for this location and unit is not saved locally. Internet connection is required to update.');
      }
      this.searchQuery = '';
      return;
    }
  
    // Online mode
    try {
      const res = await axios.get(`${this.weatherUrl}?q=${this.searchQuery}&appid=${this.apiKey}&units=${this.temperatureUnit}`);
      this.searchedWeather = res.data;
      this.showModal = true;
  
      const saveKey = this.temperatureUnit === 'metric' ? 'savedWeatherC' : 'savedWeatherF';
      Preferences.set({ key: saveKey, value: JSON.stringify(res.data) });
      this.searchQuery = '';
    } catch {
      alert('Could not find weather for the specified location.');
      this.searchQuery = '';
    }
  }

  closeModal() {
    this.showModal = false;
  }

  toggleSettings() {
    this.menuCtrl.toggle('settingsMenu');
  }

  // notf or toast
  async showToast(message: string) {
    const toast = await this.toastController.create({
      message,
      duration: 2000,
      position: 'bottom',
    });
    await toast.present();
  }

// Method to update the temperature unit
  updateTemperatureUnit(unit: string) {
    const saveKey = unit === 'metric' ? 'savedWeatherC' : 'savedWeatherF';
    const forecastSaveKey = `${saveKey}_forecast`;
  
    if (!this.isOnline) {
      this.temperatureUnit = unit; 
  
      Preferences.get({ key: saveKey }).then(savedWeather => {
        if (savedWeather.value) {
          const parsedWeather = JSON.parse(savedWeather.value);
          if (parsedWeather.name === this.currentWeather?.name) {
            this.currentWeather = parsedWeather;
  
            Preferences.get({ key: forecastSaveKey }).then(savedForecast => {
              if (savedForecast.value) {
                this.currentForecast = JSON.parse(savedForecast.value);
                this.showToast(`Temperature unit changed to ${unit === 'metric' ? 'Celsius' : 'Fahrenheit'}.`);
              } else {
                this.showToast('Forecast data for this unit is not saved locally.');
              }
            });
          } else {
            this.showToast('Weather data for this unit is not saved locally.');
          }
        } else {
          this.showToast('Weather data for this unit is not saved locally.');
        }
      });
      return;
    }
  
    // Online mode
    this.temperatureUnit = unit;
  
    if (this.currentWeather) {
      const { lat, lon } = this.currentWeather.coord;
  
      axios.get(`${this.weatherUrl}?lat=${lat}&lon=${lon}&appid=${this.apiKey}&units=${unit}`)
        .then(res => {
          this.currentWeather = res.data;
          Preferences.set({ key: saveKey, value: JSON.stringify(res.data) });
          this.showToast(`Temperature unit changed to ${unit === 'metric' ? 'Celsius' : 'Fahrenheit'}.`);
        });
  
      axios.get(`${this.forecastUrl}?lat=${lat}&lon=${lon}&appid=${this.apiKey}&units=${unit}`)
        .then(res => {
          this.currentForecast = res.data;
          Preferences.set({ key: forecastSaveKey, value: JSON.stringify(res.data) });
        });
    }
  
    if (this.searchedWeather) {
      const city = this.searchedWeather.name;
  
      axios.get(`${this.weatherUrl}?q=${city}&appid=${this.apiKey}&units=${unit}`)
        .then(res => {
          this.searchedWeather = res.data;
          Preferences.set({ key: saveKey, value: JSON.stringify(res.data) });
        });
    }
  }
  
}
