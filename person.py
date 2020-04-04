import numpy as np
from copy import deepcopy
from math import gamma

def is_time_between(t,t1,t2):
    beg=t1%1
    end=t2%1
    if beg<=end:    
        if t%1>beg and t%1<=end:
            return True
    else:
        if t%1>beg or t%1<=end:
            return True
    return False
#______________________________________________________________________________

class Location:
    def __init__(self,x,y):
        self.x = x
        self.y = y
    def __str__(self):
        return "("+str(self.x)+","+str(self.y)+")"
    def __add__(self,other):
        return Location(self.x+other.x,
                        self.y+other.y)
    def __sub__(self,other):
        return Location(self.x-other.x,
                        self.y-other.y)
    def __neg__(self):
        return self*-1
    def __mul__(self,a):
        return Location(a*self.x,
                        a*self.y)
    def __truediv__(self,other):
        return Location(self.x/other.x,
                        self.y/other.y)
    def mag(self):
        return np.hypot(self.x,self.y)
#______________________________________________________________________________

class Box:
    def __init__(self,x1,y1,x2,y2):
        self.x1,self.x2 = min(x1,x2),max(x1,x2)
        self.y1,self.y2 = min(y1,y2),max(y1,y2)
    def __str__(self):
        return "{ ("+str(self.x1)+","+str(self.y1)+") ,"+"("+str(self.x2)+","+str(self.y2)+") }"
    def adapt(self):
        self.x1,self.x2 = min(self.x1,self.x2),max(self.x1,self.x2)
        self.y1,self.y2 = min(self.y1,self.y2),max(self.y1,self.y2)
    def contains(self,location):
        if location.x >= min(self.x1,self.x2) \
           and location.x <= max(self.x1,self.x2) \
           and location.y >= min(self.y1,self.y2) \
           and location.y <= max(self.y1,self.y2) :
            return True
        else:
            return False
    def random_location(self):
        x = np.random.uniform(self.x1,self.x2)
        y = np.random.uniform(self.y1,self.y2)
        return Location(x,y)
    def bound(self,location):
        return Location(min(self.x2,max(self.x1,location.x)),
                        min(self.y2,max(self.y1,location.y)))
    def center(self):
        return Location((self.x2+self.x1)/2, (self.y2+self.y1)/2)
#______________________________________________________________________________

class Disease:
    def __init__(self,radius,probability,mean_infectious_pd,sd_infectious_pd):
        self.radius = radius
        self.probability = probability
        self.mean_infectious_pd = mean_infectious_pd
        self.sd_infectious_pd = sd_infectious_pd
    def __str__(self):
        return " radius:"+str(self.radius)\
               +" probability:"+str(self.probability)\
               +" mean_infectious_pd:"+str(self.mean_infectious_pd)\
               +" sd_infectious_pd:"+str(self.sd_infectious_pd)
#______________________________________________________________________________
    
class Person:
    """Represents a person

    attributes: x,y,   (position)
                status (-1 :susceptible 
                        +ve:infected; the number of days to heal 
                         0 :removed),
                home,  (tuple (x,y))
                dest,  (tuple (x,y))
    """
    #L = 1.0
    rest_frac = 0.9
    stay_frac = 0.95
    disease = Disease(0.001,1,6.4,2.3)   #characteristics of coronavirus
    mean_t_sleep = 23/24.0
    sd_t = 1/24.0
    
    def __init__(self,box,house,office):
        self.box = box
        self.house = house
        self.office= office
        self.status = -1
        self.pos  = self.house.center()
        self.home = self.house.center()
        self.work = self.office.random_location()
        self.dest = self.house.center()
        self.t_sleep = np.random.normal(Person.mean_t_sleep, Person.sd_t)%1
        self.t_wake  = (self.t_sleep+7/24.0) % 1
        self.t_work  = (self.t_sleep+10/24.0) % 1
        self.t_shop  = (self.t_sleep+8/24.0) % 1
        self.gone_work=False
        self.gone_shop=False

    def __str__(self):
        return " x:"+str(self.x)+" y:"+str(self.y)+" status:"+self.status

    def adapt(self,box):
        self.box = box
        self.pos = self.box.random_location()
        self.home = self.house.center()
        self.dest = self.house.center()
    
    def contact(self,other,repel=False):
        Dx = float(self.pos.x)-float(other.pos.x)
        Dy = float(self.pos.y)-float(other.pos.y)
        distance = np.hypot(Dx,Dy)
        if self.status<=0 and other.status<=0:
            return
        elif distance < Person.disease.radius:
            self.infect()
            other.infect()
        return

    def contact_square(self,other,repel=False):
        if self.status<=0 and other.status<=0:
            return
        else:
            d = self.pos-other.pos
            if abs(d.x) < Person.disease.radius:
                if abs(d.y) < Person.disease.radius:
                    self.infect()
                    other.infect()
        return
    
    def infect(self,definitely=False):
        if self.status < 0 \
           and (definitely==True \
                or np.random.uniform() <= Person.disease.probability) :
            scale = (Person.disease.sd_infectious_pd)**2\
                    /Person.disease.mean_infectious_pd
            shape = Person.disease.mean_infectious_pd / scale
            self.status = np.random.gamma(shape,scale)
        return

    def update(self,dt):
        if self.status > 0:
            self.status -= dt
            if self.status<0:
                self.status=0
        self.pos = self.box.bound(self.pos)
                
    def displace_by(self,dx,dy):
        self.pos.x += dx
        self.pos.y += dy
        self.pos = self.box.bound(self.pos)
        return

    def go_to_loc(self,loc,step_size):
        d = loc-self.pos
        factor=step_size/d.mag()
        self.displace_by(d.x*factor,d.y*factor)
        
    def go_to_home(self,step_size):
        self.go_to_loc(self.home,step_size)
        
    def go_to_dest(self,step_size):
        self.go_to_loc(self.dest,step_size)

    def move_drunk(self,step_size):
        if np.random.uniform() > Person.rest_frac:
            self.displace_by(step_size*np.random.uniform(-1,1),
                             step_size*np.random.uniform(-1,1))
        else:
            self.displace_by(step_size/10*np.random.uniform(-1,1),
                             step_size/10*np.random.uniform(-1,1))
        self.pos = self.box.bound(self.pos)
            
    def move_routine(self,step_size,t=0.5):
        d = self.dest-self.pos
        if d.mag()<=step_size :
            if is_time_between(t,self.t_sleep-1,self.t_wake):
                self.dest = deepcopy(self.house.center())
            if self.gone_shop==True and is_time_between(t,self.t_wake,self.t_work):
                self.dest = deepcopy(self.house.center())
            elif is_time_between(t, self.t_sleep, self.t_wake):
                self.gone_shop = False
            else:
                if is_time_between(t, self.t_work, self.t_sleep-1):
                    self.dest = self.work   # work
                if is_time_between(t, self.t_wake, self.t_shop):
                    self.dest = self.box.center()   # shop
                    self.gone_shop = True                
            
            self.move_drunk(step_size/100)
        else:
            self.go_to_dest(step_size)
            self.move_drunk(step_size/10)

    def move(self,step_size):
        d = self.dest-self.pos
        if d.mag()<=step_size :
            if (self.dest-self.home).mag() > step_size:
                self.dest = deepcopy(self.home)
            elif np.random.uniform() > Person.stay_frac:
                self.dest = self.box.center()
        if np.random.uniform() > Person.rest_frac :
            self.go_to_dest(step_size)
        else:
            self.displace_by(step_size/10*np.random.uniform(-1,1),
                             step_size/10*np.random.uniform(-1,1))
            self.pos = self.box.bound(self.pos)
            
        
        
        
        
