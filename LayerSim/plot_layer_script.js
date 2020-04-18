/*
Use stages_v2.json for this version
  Block
  |
  |>Layer
    |
    |>N
    |>susc
    |>S (Remember: 'S' is not a stage)
    |>stagesCount (Json object)
      |
      |>StageName (e.g. E,I,Q,R,Asym etc.)

*/

// PARAMETERS __________________________
const N_HISTORY_DAYS = 14;
const T_STEP = 1;
const BETA = 0.6172;

// GLOBAL VARIABLES ____________________
let globalStageData=null;
let globalStages=null;
let globalStage_fractions_by_days=null;
let globalStagesCount = null;
let globalStagesQuarantineFraction = null;
let globalStagesInfectiousness = null;
let globalStagesQuarantineFractionLockdown=null;

let progress = document.getElementById('myProgressBar');

// CLASSES _____________________________

class Layer{
  
  constructor(N=100,susc=0.62,E=0.0,stages=globalStagesCount){
    this.N=Math.floor(N);
    this.susc=susc;
    this.S = Math.floor(clone(this.N))||0;
    this.R = 0;
    this.stages=clone(stages);
    for(let stageName in this.stages){
      this.stages[stageName]=0.0;
    }
    this.historyDays=[0,0,0,0,0,0,0,0,0,0,0,0,0,0];
    this.infectiousness=1;
    this.exposeFew(E);
  }
  
  updateExpose(force){
    let newExposed = (force*this.susc*this.S);
    newExposed = Math.min(newExposed,this.S);
    this.historyPush(newExposed);
  }
  
  historyPush(newExposed) {
    for(let stageName in this.stages){
      this.stages[stageName]=0;
    }
    
    let popped=this.historyDays.pop(); //Pop the last element from historyDays
    
    let pushed = newExposed;
    this.S -= pushed;
    this.historyDays.unshift(pushed);  //Push a new element into historyDays
    
    for(let i in this.historyDays){
      for(let stageName in this.stages){
        this.stages[stageName] += this.historyDays[i] * globalStage_fractions_by_days[stageName][i];
      }
    }
    
    let sum=0;
    for (let stageName in this.stages){
      sum += parseFloat(this.stages[stageName]);
    }
    
    this.stages.R = this.N - this.S - sum + parseFloat(this.stages['R']);
    this.R = parseFloat(this.stages.R);
    
    let inf=0;
    for(let stageName in this.stages){
      inf += this.stages[stageName] * globalStagesInfectiousness[stageName] * (1.0-globalStagesQuarantineFraction[stageName]);
    }
    this.infectiousness=inf;
  }
  
  update() { //legacy function, deprecated
    for(let stageName in this.stages){
      this.stages[stageName]=0;
    }
    
    let popped=this.historyDays.pop(); //Pop the last element from historyDays
    //this.stages.R.count+=popped;
    
    let pushed = this.susc * this.S * this.activation;
    this.S -= pushed;
    this.historyDays.unshift(pushed);  //Push a new element into historyDays
    
    for(let i in this.historyDays){
      for(let stageName in this.stages){
        this.stages[stageName] += this.historyDays[i] * globalStage_fractions_by_days[stageName][i];
      }
    }
    
    let sum=0;
    for (let stageName in this.stages){
      sum += parseFloat(this.stages[stageName]);
    }
    
    this.stages.R = this.N - this.S - sum + parseFloat(this.stages["R"]);
    //console.log(this.N,this.S,sum-this.stages.R.count,this.stages.R.count);
    
    let inf=0;
    for(let stageName in this.stages){
      inf += this.stages[stageName] * globalStagesInfectiousness[stageName] * (1.0-globalStagesQuarantineFraction[stageName]);
    }
    this.infectiousness=inf;
  }
  
  exposeFew(newExposed){
    //this.stages['E'] += newExposed;
    this.S -= newExposed;
    this.historyPush(newExposed);
  }
}


class Block{
  
  constructor(myLayers=[],id="None",stages=globalStagesCount){
    this.blockLayers = myLayers;
    this.id=id;
    this.N=0;
    this.S=0;
    this.I=0;
    this.R=0;
    this.activation  = 0;
    this.infectiousness=0;
    this.stages = clone(stages);
    this.calibrateUpwards();
  }
  
  calibrateUpwards(){
    this.N=0;
    this.S=0;
    this.I=0;
    this.R=0;
    this.infectiousness=0;
    this.stages=clone(globalStagesCount);
    for(let i in this.blockLayers){
      this.N += this.blockLayers[i].N;
      this.S += this.blockLayers[i].S;
      this.R += this.blockLayers[i].R;
      this.infectiousness+=parseFloat(this.blockLayers[i].infectiousness);
      for (let stageName in this.stages){
        this.stages[stageName] += this.blockLayers[i].stages[stageName];
      }
    }
    this.I = this.N - this.S - this.R;
  }
  
  updateExpose(force){
    for (let index in this.blockLayers){
      this.blockLayers[index].updateExpose(force);
    }
    this.calibrateUpwards();
  }
  
  exposeFew(newExposed){
    this.blockLayers[0].exposeFew(newExposed);
    this.calibrateUpwards();
  }
  
}


async function getWardData(){
  let wards=[];
  const response = await fetch('https://raw.githubusercontent.com/Coder-inquirer/SimpleCOVID19Simulator/master/LayerSim/delhi_lat_lon_popl.csv');
  const data = await response.text();
  //console.log(data);
  const rows = data.split('\n').slice(1);
  rows.forEach(elt=>{
    const row = elt.split(',');
    const id = row[0];
    const lon=row[1];
    const lat=row[2];
    const popl=row[3];
    //console.log(id,lon,lat,popl);
    wards.push(clone({"id":id,"lon":lon,"lat":lat,"popl":popl}));
  });
  return wards;
}

async function getLayerData(){
  let myLayers=[];
  const response = await fetch('https://raw.githubusercontent.com/Coder-inquirer/SimpleCOVID19Simulator/master/LayerSim/vulnerability_delhi.csv');
  const data = await response.text();
  
  const rows = data.split('\n').slice(1);
  rows.forEach(elt=>{
    const row = elt.split(',');
    const id = row[0];
    const lon=row[1];
    const lat=row[2];
    const popl=row[3];
    
    myLayers.push(clone({"vulnerability":row[0],"fraction":row[1] } ));
  });
  return myLayers;
}

function createNewBlock(N,id,layersData){
  let myLayers=[];
  for(let i=0; i<layersData.length-1; i++){
    if(layersData[i]!=null){
      let myLayer = new Layer(Math.floor(layersData[i].fraction*N),
                              BETA/0.45*layersData[i].vulnerability);
      myLayers.push(myLayer);
    }
  }
  let myBlock=new Block(myLayers,id);
  return myBlock;
}

async function simulate(){
  progress.value=0.1
  const wards = await getWardData();
  progress.value=0.3;
  const layersData = await getLayerData();
  progress.value=0.4;
  globalStageData = await getStageData();
  progress.value=0.5;
  globalStages = globalStageData.stages;
  globalStage_fractions_by_days = globalStageData.stage_fractions_by_days;
  globalStagesCount = clone(globalStageData.stagesCount);
  globalStagesQuarantineFraction = clone(globalStageData.stagesQuarantineFraction);
  globalStagesQuarantineFractionLockdown = clone(globalStageData.stagesQuarantineFractionLockdown);
  globalStagesInfectiousness = clone(globalStageData.stagesInfectiousness);
  
  
  let myLayers = [];
  let myBlocks = [];
  
  let xData=[];
  let ySData=[];
  let yIData=[];
  let yRData=[];
  let adj=[];
  
  for(let i=0; i<wards.length-1; i++){
    progress.value=(i+1)/wards.length;
    if(wards[i]!=null){
      //let myBlock=createNewBlock(parseFloat(wards[i]['popl']),layersData);
      myBlocks.push(createNewBlock(parseFloat(wards[i]['popl']),id=wards[i]['id'],layersData));
    }
    
    adj.push([]);
    for(let j=0; j<wards.length-1; j++){
      if (i==j){
        adj[i].push(1);
      }
      else{
        dist = haversine(wards[i]['lon'],wards[i]['lat'],wards[j]['lon'],wards[j]['lat']);
        if (dist<10)
          adj[i].push(1/dist/100);
        else
          adj[i].push(0);
      }
    }
  }
  progress.value=0.6;
  
  
  myBlocks[0].exposeFew(1);
  let triggering = true;
  let lockdownOnTrigger = 1000;
  let lockdownOffTrigger = 50;
  let lockdownImposed=false;
  
  
  let NDays=320
  
  for(let i=0; i<NDays; i++){
    progress.value=(i+1)/NDays;
    let yS=0;
    let yI=0;
    let yR=0;
    
    for (let j in myBlocks){
      myBlocks[j].activation=0;
      for (k in myBlocks){
        //myBlocks[j].activation += parseFloat(myBlocks[k].I/myBlocks[k].N) * adj[j][k];
        myBlocks[j].activation += myBlocks[k].infectiousness/myBlocks[k].N * adj[j][k];
      }
    }
    
    //let j=0;
    for (let j in myBlocks){
      myBlocks[j].updateExpose(myBlocks[j].activation);
      yS+=myBlocks[j].S;
      yI+=myBlocks[j].N-myBlocks[j].S-myBlocks[j].R;
      yR+=myBlocks[j].R;
    }
    if (triggering==true){
      if (lockdownImposed==false && yI>lockdownOnTrigger){
        lockdownImposed=true; 
        globalStagesQuarantineFraction = clone(globalStageData.stagesQuarantineFractionLockdown);
      }
      else if(lockdownImposed==true && yI<=lockdownOffTrigger){
        lockdownImposed=false;
        globalStagesQuarantineFraction = clone(globalStageData.stagesQuarantineFraction);
      }
    }
    xData.push(i);
    ySData.push(yS);
    yIData.push(yI);
    yRData.push(yR);
  }
  
  //const colors=['blue','red','green'];
  const colors=['#536DFE',
                '#FF5722',
                '#8BC34A'
                ]; 
  const bgColors=['rgba(0,0,255,0.5)',
                  'rgba(255,0,0,0.5)',
                  'rgba(0,255,0,0.5)'
                 ];
                 
  chartIt('myChart',xData,[ySData,yIData,yRData],["S","I","R"],colors,bgColors,'SIR Simulation',true,false,'logarithmic');
  chartIt('mySChart',xData,[ySData],["S"],[colors[0]],[bgColors[0]],'Susceptible');
  chartIt('myIChart',xData,[yIData],["I"],[colors[1]],[bgColors[1]],'Infectious');
  chartIt('myRChart',xData,[yRData],["R"],[colors[2]],[bgColors[2]],'Recovered');
  progress.style="width:0%";    //QUICK AND DIRTY
  console.log(myBlocks[0]);
}

async function chartIt(chartId,xData,yData,labels,colors,bgColors,title,legendDisplay=false,stacked=false,yType='linear'){ // xData=[x1,x2,...], yData=[[y11,y12,...],[y21,y22,...],...], labels=[l1,l2,...]
  
  
  let ctx = document.getElementById(chartId);
  Chart.defaults.global.elements.line.borderWidth = 10;
  //Chart.defaults.global.elements.point.backgroundColor = 'rgba(0, 0, 0, 0.1)';
  
  datasets=[];
  for (index in yData){
    console.log("index");
    dataset = {
        label: labels[index],
        data: yData[index],
        fill: stacked,
        borderColor:colors[index],
        backgroundColor:bgColors[index],
        borderWidth: 1
      };
    datasets.push(dataset);
  }
  
  let myChart = new Chart(ctx, {
    type: 'line',
    data: {
          labels: xData,
          datasets: datasets
          },
      options: {
          legend:{
            display: legendDisplay
          },
          //responsive: true,
          //maintainAspectRatio: false,
          title: {
              display: true,
              text: title
          },
          scales: {
              yAxes: [{
                  type: yType,
                  stacked: stacked,
                  scaleLabel:{
                      display: true,
                      labelString: "Number of people"
                  }
              }],
              xAxes: [{
                  scaleLabel:{
                      display: true,
                      labelString: "Days"
                  }
              }]
          }
      }
  });
}

async function plotParams(){
  fraction = await getStagesFractionChartData();
  xData = fraction.xData;
  yData = fraction.yData;
  labels = fraction.labels;
  const colors=['blue','yellow','red','green'];
  const bgColors=['blue','yellow','red','green'];
  chartIt('myProgressionChart',xData,yData,labels,colors,bgColors,'Stage Progression Parameters',true,true);
}

async function getStagesFractionChartData(){
  const xData=[1,2,3,4,5,6,7,8,9,10,11,12,13,14];
  const yData=[];
  const labels=[];
  let responseJson = await getStageData();
  let stage_fractions_by_days=responseJson["stage_fractions_by_days"];
  //console.log(responseJson)
  console.log("getting fraction data");
  for (stage_name in stage_fractions_by_days){
    yData.push(stage_fractions_by_days[stage_name]);
    labels.push(stage_name);
  }
  
  return {xData,yData,labels};
}

async function getStageData(){
  console.log("getting stage data");
  let stages,stage_fractions_by_days,responseJson;
  
  const jsonURL = 'https://raw.githubusercontent.com/Coder-inquirer/SimpleCOVID19Simulator/master/LayerSim/stages_v2_1.json';
  try {
    let response = await fetch(jsonURL);
    responseJson = await response.json();
  } catch(error) {
    console.error(error);
  }
  console.log(responseJson);
  return responseJson;
}

function clone(obj){ 
  return JSON.parse(JSON.stringify(obj));
} 

function toRad(Value) {
    /** Converts numeric degrees to radians */
    return Value * Math.PI / 180;
}

function haversine(lon1,lat1,lon2,lat2){
  let R = 6371; // kilometres
  let phi1 = toRad(lat1);
  let phi2 = toRad(lat2);
  let dphi = toRad(lat2-lat1);
  let dlambda = toRad(lon2-lon1);

  let a = Math.sin(dphi/2) * Math.sin(dphi/2) +
          Math.cos(phi1) * Math.cos(phi2) *
          Math.sin(dlambda/2) * Math.sin(dlambda/2);
  let c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c;
}
 
simulate();
plotParams();


