#import csv
import matplotlib.pyplot as plt
from collections import deque
import numpy as np
from scipy.stats import gamma

# PARAMETERS _______________________________________________________
N_HISTORY_DAYS = 14
I_HISTORY_DAYS = E_HISTORY_DAYS = N_HISTORY_DAYS
MEAN_INFECTIOUS_PD  = 6.4   # in days
SD_INFECTIOUS_PD    = 2.3   # in days
T_STEP = 1                  # in days

BETA = 0.6172
# __________________________________________________________________

inf_t_scale = SD_INFECTIOUS_PD**2/MEAN_INFECTIOUS_PD
inf_t_shape = MEAN_INFECTIOUS_PD / inf_t_scale
t_dist = gamma( a=inf_t_shape, scale=inf_t_scale)

FALLEN_SICK_PROB_ARRAY  = t_dist.cdf(np.arange(N_HISTORY_DAYS))
FALLING_SICK_PROB_ARRAY = t_dist.pdf(np.arange(N_HISTORY_DAYS))

STAGE_FRAC={"E": np.ones(N_HISTORY_DAYS)-np.array(FALLEN_SICK_PROB_ARRAY)-np.array(FALLING_SICK_PROB_ARRAY),
            "I": FALLING_SICK_PROB_ARRAY,
            "R": FALLEN_SICK_PROB_ARRAY }
PREV_STAGE={"E":"E", "I":"E", "R":"I"}

# CLASS Layer =============================================

class Layer:
    def __init__(self,susc,N,E=0,R=0):
        self.susc=susc  #effectively equivalent to beta*(factors rel to immunity etc) 
        self.N=N
        self.S=N-E-R
        self.E=E
        self.stage={}
        for stage1 in STAGE_FRAC:
            self.stage[stage1]=0
        self.R=R
        #additional labels for Asymptomatic positive and negative and quarantine etc.
        self.exposed_history =deque([0]*E_HISTORY_DAYS, E_HISTORY_DAYS)

        self.exposed_history.appendleft(E)

    def __str__(self):
        return "N:%g I:%g R%g"%(self.N,self.I,self.R)

    def update_expose(self,force):
        new_exposed = int(force*self.susc*self.S)    # or any general function of S/N
        new_exposed = min(new_exposed,self.S)

        self.S-=new_exposed
        self.exposed_history_push(new_exposed)
        # consider adding a delay queue, much like exposed_history queue

    def exposed_history_push(self,new_exposed):
        """handles history, stages and recovery"""
        temp={}
        for stage in self.stage:
            temp[stage]=self.stage[stage]=0

        new_R = 0            
        for i in range(E_HISTORY_DAYS):
            for stage in self.stage:
                temp[stage] = int(self.exposed_history[i]*STAGE_FRAC[stage][i])
                self.stage[stage]+=temp[stage]

        #pop oldest element from history
        self.stage["R"] += self.N-self.S-sum(self.stage.values())
        x=self.exposed_history.pop()
        self.R=self.stage["R"]
        #self.R=self.N-self.S-sum(self.stage.values())
        self.E=self.stage["E"]

        # add newly exposed
        self.exposed_history.appendleft(new_exposed)

        
# CLASS Block =============================================

class Block:
    def __init__(self,layers=[]):
        self.layers=layers
        self.calibrate_upwards()
        self.activation=0

    def calibrate_upwards(self):
        N=S=E=R=0
        for layer in self.layers:
            N+=layer.N
            E+=layer.stage["E"]
            R+=layer.stage["R"]

        self.N=N
        self.S=N-E-R
        self.E=E
        self.R=R

        #later add code to sum over history too

    def __str__(self):
        return "N:%g E:%g R%g"%(self.N,self.E,self.R)

    def update_expose(self):
        force = min(self.activation,1.0)
        
        for layer in self.layers:
            layer.update_expose(force)
            
        self.calibrate_upwards()

    def update_activate(self,force=0):
        self.activation=force
        
#============================================================    
n_days = 220
city = [ Block([Layer(susc=BETA,N=10000,E=10),
                Layer(susc=BETA/8.0,N=4000,E=0),
                Layer(susc=BETA/4.0,N=1000,E=0)]) ,
         Block([Layer(susc=BETA,N=10000,E=0),
                Layer(susc=BETA/8.0,N=4000,E=0),
                Layer(susc=BETA/4.0,N=1000,E=0)]) ,
         Block([Layer(susc=BETA,N=10000,E=0),
                Layer(susc=BETA/8.0,N=4000,E=0),
                Layer(susc=BETA/4.0,N=1000,E=0)]) ,
         Block([Layer(susc=BETA,N=10000,E=0),
                Layer(susc=BETA/8.0,N=4000,E=0),
                Layer(susc=BETA/4.0,N=1000,E=0)]) ,
         Block([Layer(susc=BETA,N=10000,E=0),
                Layer(susc=BETA/8.0,N=4000,E=0),
                Layer(susc=BETA/4.0,N=1000,E=0)]) ,
         Block([Layer(susc=BETA,N=10000,E=0),
                Layer(susc=BETA/8.0,N=4000,E=0),
                Layer(susc=BETA/4.0,N=1000,E=0)]) ,
         Block([Layer(susc=BETA,N=10000,E=0),
                Layer(susc=BETA/8.0,N=4000,E=0),
                Layer(susc=BETA/4.0,N=1000,E=0)]) ]

#ones=0.05*np.random.rand(len(city),len(city))
#adj = np.eye(len(city))+np.tril(ones,-1)+np.triu(ones,+1)
adj = np.eye(len(city))\
      +0.01*np.eye(len(city),k=1)\
      +0.01*np.eye(len(city),k=-1)\
      +0.01*np.eye(len(city),k=-2)\
      +0.01*np.eye(len(city),k=2)

print(adj)

S=[]
E=[]
I=[]
R=[]
for i in range(n_days):

    for j in range(len(city)):
        city[j].activation=0
        for k in range(len(city)):
            city[j].activation += city[k].E/city[k].N*adj[j][k]

    for j in range(len(city)):
        city[j].update_expose()

    E.append(sum([city[j].E for j in range(len(city))]))
    R.append(sum([city[j].R for j in range(len(city))]))


#plt.stackplot(range(N_HISTORY_DAYS),STAGE_FRAC["E"],STAGE_FRAC["I"],STAGE_FRAC["R"])
#plt.stackplot(range(N_HISTORY_DAYS),STAGE_FRAC.values(),labels=STAGE_FRAC)
plt.plot(range(n_days),E,label="E")
plt.plot(range(n_days),R,label="R")
plt.ylim(0,sum([city[j].N for j in range(len(city))]))
plt.legend()
plt.show()
    
    

