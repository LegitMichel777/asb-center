// pages/MainMenu/MainMenu.js
import { AnyPreviewType, Event, SecureCodePreview } from '../../classes/event'
import {DisplayRow} from '../../classes/displayRow'
import { getTimeDifference, getUnixTime, withinRange, extendNumberToLengthString } from '../../utils/util';
import { sha256 } from '../../utils/sha256';
import { createQRCode, previewEnum, userDataType } from '../../utils/common';
import allCollectionsData from '../../utils/allCollectionsData';
interface SecureCodePreviewData {
  userCode: String;
}
export interface PreviewGenerator {
  eventId: string;
  previewMode: previewEnum;
  previewPort: string;
  previewData: SecureCodePreviewData;
}
interface componentDataInterface {
  masterEventsData: Array<Event>;
  userData: userDataType;
  myEventsData: Array<DisplayRow>;
  currentEventsData: Array<DisplayRow>;
  pastEventsData: Array<DisplayRow>;
  lastUpdateTime: string;

  // UI-independent variables
  db: DB.Database;
  previewGenerator: Array<PreviewGenerator>;
  previewLastGen: Map<string, string>;
};
Component({

  /**
   * Component properties
   */
  properties: {

  },

  /**
   * Component initial data
   */
  data: {} as componentDataInterface,

  /**
   * Component methods
   */
  methods: {
    fetchServerData: async function() {
      let serverEventData = await allCollectionsData(this.data.db, "event");

      let newEventsDb = [];
      for (let i=0;i<serverEventData.data.length;i++) {
        let currentDataEntry = serverEventData.data[i];
        let currentDataEntryPreview: AnyPreviewType = null;
        if (currentDataEntry.preview.type=="secureCodePreview") {
          currentDataEntryPreview=new SecureCodePreview(currentDataEntry.preview.title, currentDataEntry.preview.caption.replace(/\\n/gi, '\n'));
        }
        newEventsDb.push(new Event(currentDataEntry.id, currentDataEntry.name, currentDataEntryPreview, currentDataEntry.eventVisibleDate, currentDataEntry.displayEventBegin, currentDataEntry.displayEventEnd, currentDataEntry.accessibleEventBegin, currentDataEntry.accessibleEventEnd, currentDataEntry.menuEventBegin, currentDataEntry.menuEventEnd));
      }

      console.log(newEventsDb);
      
      // simulate retrieving from a server
      this.setData({
        userData: {id: "ID given by wechat", student: {id: "student id", name: "Michel", grade: 11, class: 3}, info: {SportsMeet2021Data: {joined: true, secureCodeString: "secretRandomString"}}},
        masterEventsData: newEventsDb,
      });
    },
    scanButtonClick: function() {
      console.log("Scan QR Code")
      // implement this
    },
    handleEventRowClick: function(x: any) {
      let eventClickedId=x.currentTarget.dataset.id;
      if (eventClickedId==="SportsMeet2021") {
        wx.navigateTo({
          url: '/pages/SportsMeet/SportsMeet',
          success: (res) => {
            res.eventChannel.emit('userData', this.data.userData);
            res.eventChannel.emit('eventId', 'SportsMeet2021');
            res.eventChannel.emit('eventInfo', this.data.masterEventsData.find((val) => {
              return val.id === eventClickedId;
            }));
            res.eventChannel.emit('previewInfo', this.data.previewGenerator.find((val) => {
              return val.eventId === eventClickedId;
            }));
          }
        });
      }
    },
    onLoad: function() {
      wx.cloud.init();
      this.data.db = wx.cloud.database();
      this.data.previewGenerator = [];
      this.data.previewLastGen = new Map();
      this.fetchServerData().then(() => {
        // initialize views and start the auto refresh cycle.
        this.recomputeData(false);
        setTimeout(
          () => {
            setInterval(() => {this.recomputeData(true)}, 500);
         }, 500
        );
      });
      // preform cleanup operations
      setInterval(() => {
        this.data.previewLastGen = new Map();
      }, 5*1000*60);
    },
    recomputeData: function(incremental: boolean) {
      console.log("Tick");
      let newMyEventsData:Array<DisplayRow>=[];
      let newCurrentEventsData:Array<DisplayRow>=[];
      let newPastEventsData:Array<DisplayRow>=[];
      let newPreviewGenerator:Array<PreviewGenerator>=[];
      // recompute the display data for events
      for (let i=0;i<this.data.masterEventsData.length;i++) {
        const consideredEvent = this.data.masterEventsData[i];
        let displayRow = new DisplayRow(consideredEvent.name, withinRange(getUnixTime(), consideredEvent.menuEventBegin, consideredEvent.menuEventEnd) ? "now" : getTimeDifference(getUnixTime(), consideredEvent.displayEventEnd), withinRange(getUnixTime(), consideredEvent.accessibleEventBegin, consideredEvent.accessibleEventEnd), consideredEvent.id, null);
        if (getUnixTime()<=consideredEvent.displayEventEnd) {
          let userInfo=this.data.userData.info[`${consideredEvent.id}Data`];
          if (userInfo !== undefined && userInfo.joined===true) {
            if (this.data.masterEventsData[i].preview instanceof SecureCodePreview) {
              if (userInfo.secureCodeString !== undefined) {
                let currentPreviewPort = `previewPort${i}`;
                newPreviewGenerator.push({eventId: consideredEvent.id,previewMode: "secureCodePreview", previewPort: currentPreviewPort, previewData: {userCode: userInfo.secureCodeString}});

                displayRow.previewData={previewMode: "secureCodePreview", title: this.data.masterEventsData[i].preview!.title, subtitle: this.data.masterEventsData[i].preview!.caption, previewPort: currentPreviewPort };
              }
            }
            newMyEventsData.push(displayRow);
          } else {
            newCurrentEventsData.push(displayRow);
          }
        } else {
          newPastEventsData.push(displayRow);
        }
      }
      this.data.previewGenerator = newPreviewGenerator;
      if (incremental) {
        if (this.displayRowDiff(this.data.myEventsData, newMyEventsData)) {
          this.setData({
            myEventsData: newMyEventsData,
          });
        }
        if (this.displayRowDiff(this.data.currentEventsData, newCurrentEventsData)) {
          this.setData({
            currentEventsData: newCurrentEventsData,
          });
        }
        if (this.displayRowDiff(this.data.pastEventsData, newPastEventsData)) {
          this.setData({
            pastEventsData: newPastEventsData,
          });
        }
      } else {
        this.setData({
          myEventsData: newMyEventsData,
          currentEventsData: newCurrentEventsData,
          pastEventsData: newPastEventsData,
        });
      }
      // recompute preview data
      for (let i=0;i<newPreviewGenerator.length;i++) {
        if (newPreviewGenerator[i].previewMode==="secureCodePreview") {
          let previewTimePeriod=Math.floor(getUnixTime()/3);
          let accessCodeContents=newPreviewGenerator[i].previewData.userCode+previewTimePeriod.toString();
          accessCodeContents=sha256(accessCodeContents)!;
          if (accessCodeContents !== this.data.previewLastGen.get(newPreviewGenerator[i].previewPort)) {
            let myCreateQRCode = createQRCode.bind(this);
            myCreateQRCode(newPreviewGenerator[i].previewPort, accessCodeContents, 'ECECEC');
            this.data.previewLastGen.set(newPreviewGenerator[i].previewPort, accessCodeContents);
          }
        }
      }
      let date = new Date();
      let newUpdateString=`${extendNumberToLengthString(date.getHours(), 2)}:${extendNumberToLengthString(date.getMinutes(), 2)}:${extendNumberToLengthString(date.getSeconds(), 2)}`;
      this.setData({
        lastUpdateTime: newUpdateString,
      });
    },
    displayRowDiff: function(a: Array<DisplayRow>, b: Array<DisplayRow>) {
      if (a.length !== b.length) return true;
      for (let i=0;i<a.length;i++) {
        if (a[i].canJump !== b[i].canJump || a[i].jumpTo !== b[i].jumpTo || a[i].timeLeft !== b[i].timeLeft || a[i].title !== b[i].title) {
          return true;
        }
      }
      return false;
    }
  },
})